export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T;
  return data;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const payload = await parseJson<T & { detail?: string }>(response);

  if (!response.ok) {
    const detail = (payload as { detail?: string }).detail ?? "Unexpected API error";
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

export function toApiAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) {
    return "";
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("/")) {
    return `${API_BASE_URL}${pathOrUrl}`;
  }
  return `${API_BASE_URL}/${pathOrUrl}`;
}
