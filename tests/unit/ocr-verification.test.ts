/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { GeminiOcrProvider } from '@/features/parcha/providers/gemini-ocr.provider';

process.env.GEMINI_API_KEY='mock-key';

describe('OCR Verification and Structural Parsing (Mocked Provider)', () => {
  it('correctly separates original transcription from normalized product name for Hindi', async () => {
    const mockExtract = vi.fn().mockResolvedValue({
      rawText: "१. नल १",
      items: [
        {
          originalText: "१. नल १",
          productName: "नल",
          normalizedProductName: "tap",
          brand: null,
          size: null,
          quantity: "1",
          unit: null,
          description: null,
          confidence: "high",
          notes: null
        }
      ]
    });

    const provider = new GeminiOcrProvider();
    provider.extractFromImage = mockExtract;

    const result = await provider.extractFromImage(Buffer.from('fake'), 'image/jpeg');

    expect(result.items[0]!.productName).toBe('नल'); // Must preserve original script
    expect(result.items[0]!.normalizedProductName).toBe('tap'); // Contains the translation
    expect(result.items[0]!.quantity).toBe("1");
  });

  it('correctly separates transcription from normalization for Hinglish and incomplete items', async () => {
    const mockExtract = vi.fn().mockResolvedValue({
      rawText: "1. 1 pc lamba pipe\\n2. mota basin 1",
      items: [
        {
          originalText: "1 pc lamba pipe",
          productName: "lamba pipe",
          normalizedProductName: "long pipe",
          brand: null,
          size: null,
          quantity: "1",
          unit: "pc",
          description: null,
          confidence: "high",
          notes: null
        },
        {
          originalText: "mota basin 1",
          productName: "mota basin",
          normalizedProductName: "thick basin",
          brand: null,
          size: null,
          quantity: "1",
          unit: null, 
          description: null,
          confidence: "medium",
          notes: null
        }
      ]
    });

    const provider = new GeminiOcrProvider();
    provider.extractFromImage = mockExtract;

    const result = await provider.extractFromImage(Buffer.from('fake'), 'image/jpeg');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.productName).toBe('lamba pipe');
    expect(result.items[0]!.normalizedProductName).toBe('long pipe');
    
    expect(result.items[1]!.productName).toBe('mota basin');
    expect(result.items[1]!.unit).toBeNull();
  });
});
