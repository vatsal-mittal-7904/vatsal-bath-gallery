import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiOcrProvider } from '../../src/features/parcha/providers/gemini-ocr.provider';
import { GoogleGenerativeAI } from '@google/generative-ai';

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn(),
    SchemaType: {
      STRING: 'string',
      ARRAY: 'array',
      OBJECT: 'object',
    },
    Type: {
      OBJECT: 'object',
      STRING: 'string',
      ARRAY: 'array'
    }
  };
});

describe('GeminiOcrProvider', () => {
  const mockGenerateContent = vi.fn();
  
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GEMINI_API_KEY = 'test_api_key';
    
    (GoogleGenerativeAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() { return {
      getGenerativeModel: () => ({
        generateContent: mockGenerateContent
      })
    }; });
  });

  it('throws error if API key is missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiOcrProvider()).toThrow('GEMINI_API_KEY is missing');
  });

  it('successfully extracts items from image with valid mocked response', async () => {
    const provider = new GeminiOcrProvider();
    
    // Mock valid API response
    const mockResponseText = JSON.stringify({
      rawText: "1 pc CP tap\\n2 pipes",
      items: [
        {
          originalText: "1 pc CP tap",
          productName: "CP tap",
          normalizedProductName: "CP tap",
          brand: null,
          size: null,
          quantity: "1",
          unit: "pc",
          description: null,
          confidence: "high",
          notes: null
        }
      ]
    });
    
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => mockResponseText
      }
    });

    const buffer = Buffer.from('fake-image');
    const result = await provider.extractFromImage(buffer, 'image/jpeg');

    expect(result.rawText).toBe("1 pc CP tap\\n2 pipes");
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.productName).toBe("CP tap");
    expect(result.items[0]?.confidence).toBe("high");
    
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
  
  it('throws if gemini returns malformed JSON or schema fails', async () => {
    const provider = new GeminiOcrProvider();
    
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => "not a json"
      }
    });

    const buffer = Buffer.from('fake-image');
    await expect(provider.extractFromImage(buffer, 'image/jpeg')).rejects.toThrow('OCR processing failed');
  });
});
