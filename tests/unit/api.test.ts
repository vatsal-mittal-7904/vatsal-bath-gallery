import { describe, it, expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { withApiWrapper, successResponse } from '../../src/lib/api-wrapper';
import { ValidationError } from '../../src/lib/errors';
import { z } from 'zod';

describe('API Wrapper', () => {
  it('handles success response', async () => {
    const handler = async (__req: NextRequest) => {
      return successResponse({ foo: 'bar' }, 'Success', 200, req);
    };
    const wrapped = withApiWrapper(handler);
    const req = new NextRequest('http://localhost/api/v1/test', {
      headers: { 'x-request-id': 'test-123' },
    });
    
    const response = await wrapped(req, {});
    const json = await response.json();
    
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.foo).toBe('bar');
    expect(json.requestId).toBe('test-123');
  });

  it('handles AppError properly', async () => {
    const handler = async (__req: NextRequest) => {
      throw new ValidationError('Bad request');
    };
    const wrapped = withApiWrapper(handler);
    const req = new NextRequest('http://localhost/api/v1/test');
    
    const response = await wrapped(req, {});
    const json = await response.json();
    
    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('Bad request');
  });

  it('handles ZodError properly', async () => {
    const handler = async (__req: NextRequest) => {
      z.string().parse(123);
      return NextResponse.json({});
    };
    const wrapped = withApiWrapper(handler);
    const req = new NextRequest('http://localhost/api/v1/test');
    
    const response = await wrapped(req, {});
    const json = await response.json();
    
    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('The request is invalid');
  });

  it('handles unknown errors as 500', async () => {
    const handler = async (__req: NextRequest) => {
      throw new Error('Something exploded');
    };
    const wrapped = withApiWrapper(handler);
    const req = new NextRequest('http://localhost/api/v1/test');
    
    const response = await wrapped(req, {});
    const json = await response.json();
    
    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INTERNAL_SERVER_ERROR');
    // Ensure we don't leak the exact message
    expect(json.error.message).toBe('An unexpected error occurred');
  });
});
