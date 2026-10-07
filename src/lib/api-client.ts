/**
 * A simple typed fetch wrapper for the internal Next.js API.
 * Uses relative URLs assuming it runs on the client.
 */

interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  requestId: string;
}

export class ApiFetchError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiFetchError';
  }
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith('/api/v1') ? endpoint : `/api/v1${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  let json: (ApiResponse<T> & Record<string, unknown>) | null = null;
  try {
    json = (await response.json()) as ApiResponse<T> & Record<string, unknown>;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorMsg =
      json?.error?.message ||
      (typeof json?.error === 'string' ? json.error : null) ||
      (typeof json?.message === 'string' ? json.message : null) ||
      'An unexpected error occurred';
    const errorCode = json?.error?.code || (typeof json?.code === 'string' ? json.code : 'UNKNOWN');
    throw new ApiFetchError(errorMsg, response.status, errorCode);
  }

  // Handle explicit API failure payload: { success: false, ... }
  if (json && typeof json === 'object' && 'success' in json && json.success === false) {
    const errorMsg =
      json.error?.message ||
      (typeof json.error === 'string' ? json.error : null) ||
      'The request was unsuccessful';
    const errorCode = json.error?.code || 'API_ERROR';
    throw new ApiFetchError(errorMsg, response.status, errorCode);
  }

  // If standard API wrapper ({ success: true, data: T }), unwrap data
  if (json && typeof json === 'object' && json.success === true && 'data' in json) {
    return json.data as T;
  }

  // Otherwise return raw json payload directly
  return json as T;
}
