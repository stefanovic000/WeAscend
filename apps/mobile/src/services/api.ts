const DEFAULT_API_URL = "https://weascend.wesystemlabs.com";

export const API_BASE_URL = (process.env.EXPO_PUBLIC_WEASCEND_API_URL?.trim() || DEFAULT_API_URL).replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { code?: string };
  if (!response.ok) {
    const error = new Error(payload.code || `http_${response.status}`) as Error & { code: string };
    error.code = payload.code || `http_${response.status}`;
    throw error;
  }
  return payload;
}
