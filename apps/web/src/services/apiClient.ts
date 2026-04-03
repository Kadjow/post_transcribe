export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function fallbackMessageByStatus(status: number): string {
  if (status === 400) {
    return "Nao foi possivel processar a solicitacao enviada.";
  }
  if (status === 413) {
    return "O arquivo enviado excede o limite permitido.";
  }
  if (status === 415) {
    return "Formato de arquivo nao suportado.";
  }
  if (status >= 500) {
    return "Servico temporariamente indisponivel.";
  }
  return "Erro inesperado na API.";
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T;
  return data;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new ApiError("Falha de comunicacao com o servidor.", 0);
  }

  const payload = await parseJson<T & { detail?: string }>(response);

  if (!response.ok) {
    const detail =
      (payload as { detail?: string }).detail ?? fallbackMessageByStatus(response.status);
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
