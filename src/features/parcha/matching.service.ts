/* eslint-disable @typescript-eslint/no-explicit-any */
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { toSafeProduct } from '@/features/catalogue/catalogue.utils';
import { ParchaJobRow } from '@prisma/client';

export function parseDimensions(str?: string | null) {
  if (!str) return {};
  let s = str.toLowerCase().replace(/\"/g, ' inch ').replace(/°/g, ' deg ');

  const angleMatch = s.match(/(90|45)\s*(?:deg|degree|d\b|°)?/i);
  const angle = angleMatch ? angleMatch[1] : null;

  const lengthMatch = s.match(/(\d+)\s*ft\b/i);
  const length = lengthMatch ? lengthMatch[1] : null;
  if (lengthMatch) {
    s = s.replace(/(\d+)\s*ft\b/gi, '');
  }

  const compoundMatch = s.match(/(\d+(?:\/\d+)?)\s*(?:inch|\")?\s*(?:x|×|\*|by)\s*(\d+(?:\/\d+)?)/i);
  if (compoundMatch) {
    return {
      primary: compoundMatch[1],
      secondary: compoundMatch[2],
      length,
      angle
    };
  }

  const fracMatch = s.match(/(\b[1-9]\/[1-9]\b)/);
  if (fracMatch) {
    return {
      primary: fracMatch[1],
      secondary: null,
      length,
      angle
    };
  }

  const singleMatch = s.match(/(?:^|[^\d/])([1-9]\d?)\s*(?:inch|\")?(?:[^\d/]|$)/);
  const primary = singleMatch ? singleMatch[1] : null;

  return {
    primary,
    secondary: null,
    length,
    angle
  };
}

export function matchVariantDimensions(v: any, targetDim: ReturnType<typeof parseDimensions>) {
  if (!targetDim.primary && !targetDim.secondary && !targetDim.angle && !targetDim.length) {
    return false;
  }
  const attrs = (v.attributes || {}) as Record<string, any>;
  const fullText = [attrs.size, attrs.variantName, attrs.attributes, attrs.description, v.sku].filter(Boolean).join(' ');
  const vDim = parseDimensions(fullText);

  if (targetDim.primary && vDim.primary !== targetDim.primary) return false;
  if (targetDim.secondary && vDim.secondary !== targetDim.secondary) return false;
  if (targetDim.angle && vDim.angle && vDim.angle !== targetDim.angle) return false;
  if (targetDim.length && vDim.length && vDim.length !== targetDim.length) return false;

  return true;
}

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
      let searchResult = await CatalogueService.listProducts({
        page: 1,
        limit: 5,
        search: extendedSearch,
        isActive: true
      });

      if (searchResult.items.length === 0 && extendedSearch !== primarySearchTerm) {
        searchResult = await CatalogueService.listProducts({
          page: 1,
          limit: 5,
          search: primarySearchTerm,
          isActive: true
        });
      }

      // If still 0 items, try stripping common prefix e.g. "PVC ", "CPVC ", "UPVC "
      if (searchResult.items.length === 0) {
        const strippedTerm = primarySearchTerm.replace(/^(pvc|cpvc|upvc)\s+/i, '').trim();
        if (strippedTerm && strippedTerm !== primarySearchTerm) {
          searchResult = await CatalogueService.listProducts({
            page: 1,
            limit: 5,
            search: strippedTerm,
            isActive: true
          });
        }
      }

      const rawTargetText = [row.revisedSize, row.ocrSize, primarySearchTerm, row.ocrOriginalText].filter(Boolean).join(' ');
      const targetDim = parseDimensions(rawTargetText);

      const candidates = searchResult.items.map(product => {
        const nameLower = product.name.toLowerCase();
        const termLower = primarySearchTerm.toLowerCase();
        
        let confidence: 'low' | 'medium' | 'high' = 'low';
        let explanation = 'Heuristic: Weak catalogue match based on general keywords.';

        const isExactName = nameLower === termLower;
        const isPartialName = nameLower.includes(termLower) || termLower.includes(nameLower) ||
          (termLower.includes('pipe') && nameLower.includes('pipe')) ||
          (termLower.includes('elbow') && nameLower.includes('elbow'));

        if (isPartialName) {
          confidence = 'medium';
          explanation = 'Heuristic: Catalogue name partially contains the extracted text.';
        }
        if (isExactName) {
          confidence = 'high';
          explanation = 'Heuristic: Exact product name match.';
        }

        let matchingVariantId: string | null = null;
        if (product.variants?.length) {
          const dimMatchedVariant = product.variants.find(v => matchVariantDimensions(v, targetDim));
          if (dimMatchedVariant) {
            matchingVariantId = dimMatchedVariant.id;
            confidence = 'high';
            explanation = 'Heuristic: Product match and explicit variant dimension match.';
          } else {
            const sizeTerm = (row.revisedSize || row.ocrSize)?.toLowerCase();
            if (sizeTerm) {
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
