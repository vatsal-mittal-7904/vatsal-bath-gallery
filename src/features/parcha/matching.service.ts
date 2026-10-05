/* eslint-disable @typescript-eslint/no-explicit-any */
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { toSafeProduct } from '@/features/catalogue/catalogue.utils';
import { ParchaJobRow } from '@prisma/client';

export class MatchingService {
  /**
   * Generates a list of candidate products for a given ParchaJobRow.
   * Returns up to 5 candidates based on the evidence available in the row.
   */
  static async suggestCandidates(row: ParchaJobRow) {
    // Collect search terms from the row
    const searchTerms = [
      row.revisedNormalizedProductName,
      row.ocrNormalizedProductName,
      row.revisedProductName,
      row.ocrProductName,
      row.ocrOriginalText
    ].filter(Boolean) as string[];

    if (searchTerms.length === 0) {
      return { candidates: [], message: 'Insufficient OCR text to generate suggestions.' };
    }

    const primarySearchTerm = searchTerms[0]!;

    let extendedSearch = primarySearchTerm;
    if (row.revisedSize || row.ocrSize) {
      extendedSearch += ' ' + (row.revisedSize || row.ocrSize);
    }

    try {
      const searchResult = await CatalogueService.listProducts({
        page: 1,
        limit: 5,
        search: extendedSearch,
        isActive: true
      });

      const candidates = searchResult.items.map(product => {
        const nameLower = product.name.toLowerCase();
        const termLower = primarySearchTerm.toLowerCase();
        
        let confidence: 'low' | 'medium' | 'high' = 'low';
        let explanation = 'Heuristic: Weak catalogue match based on general keywords.';

        if (nameLower.includes(termLower)) {
          confidence = 'medium';
          explanation = 'Heuristic: Catalogue name partially contains the extracted text.';
        }
        if (nameLower === termLower) {
          confidence = 'high';
          explanation = 'Heuristic: Exact product name match.';
        }

        const sizeTerm = (row.revisedSize || row.ocrSize)?.toLowerCase();
        let matchingVariantId = null;
        
        if (sizeTerm && product.variants?.length) {
          const matchedVariant = product.variants.find(v => {
            const attrs = typeof v.attributes === 'object' && v.attributes !== null ? v.attributes as any : {};
            return (
              (attrs.size && String(attrs.size).toLowerCase().includes(sizeTerm)) ||
              v.sku.toLowerCase().includes(sizeTerm)
            );
          });
          
          if (matchedVariant) {
            matchingVariantId = matchedVariant.id;
            confidence = 'high';
            explanation = 'Heuristic: Exact product name and explicit variant size match.';
          } else {
            explanation += ' (Warning: No variant size matched the requested size)';
          }
        }

        return {
          product: toSafeProduct(product),
          suggestedVariantId: matchingVariantId,
          confidence,
          explanation
        };
      });

      // Sort: high -> medium -> low
      candidates.sort((a, b) => {
        const score = { high: 3, medium: 2, low: 1 };
        // Tie-breaker: Name length (prefer shorter exact names)
        if (score[b.confidence] === score[a.confidence]) {
          return a.product.name.length - b.product.name.length;
        }
        return score[b.confidence] - score[a.confidence];
      });

      if (candidates.length === 0) {
        return { candidates: [], message: 'No catalogue products match the extracted text.' };
      }

      return { candidates, message: 'Candidates generated successfully based on available heuristics.' };
    } catch (e: any) {
      console.error('[MatchingService] Error suggesting candidates:', e);
      return { candidates: [], message: 'Error retrieving catalogue suggestions.' };
    }
  }
}
