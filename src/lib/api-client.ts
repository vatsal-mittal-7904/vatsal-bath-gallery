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
  const response = await fetch(`/api/v1${endpoint}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success) {
    throw new ApiFetchError(
      json.error?.message || 'An unknown error occurred',
      response.status,
      json.error?.code || 'UNKNOWN'
    );
  }

  return json.data as T;
}
