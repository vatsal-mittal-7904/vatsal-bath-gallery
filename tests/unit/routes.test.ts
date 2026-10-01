import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as HealthGET } from '../../src/app/api/v1/health/route';
import { GET as NotFoundGET } from '../../src/app/api/[...catchAll]/route';

describe('API Routes', () => {
  it('Health check returns ok', async () => {
    const req = new NextRequest('http://localhost/api/v1/health');
    const res = await HealthGET(req, {});
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
  });

  it('Catch-all returns 404', async () => {
    const req = new NextRequest('http://localhost/api/v1/unknown');
    const res = await NotFoundGET(req, {});
    const json = await res.json();
    
    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });
});
