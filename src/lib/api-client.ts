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

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || 'An unknown error occurred');
  }

  return json.data as T;
}
