const BASE = 'https://api.observer-ai.com';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Call an admin endpoint with the X-Admin-Key header.
 *
 * The admin key is deliberately never persisted anywhere — it lives in React
 * state for the life of the tab and nowhere else. It authorizes org
 * provisioning, which creates real Stripe subscriptions.
 */
export async function adminFetch<T>(
  adminKey: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'X-Admin-Key': adminKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(response.status, 'Invalid admin key.');
    }
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `Request failed (${response.status}).`;
    throw new ApiError(response.status, detail);
  }

  return data as T;
}
