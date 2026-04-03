import { API_BASE_URL, ApiError } from "../services/apiClient";

export type ErrorContext =
  | "upload"
  | "analysis"
  | "transcription"
  | "results"
  | "invalid_document"
  | "frontend";

export interface ErrorGuidance {
  title: string;
  description: string;
  nextStep: string;
}

function toMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "";
}

function includesAny(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function isNetworkError(error: unknown, message: string): boolean {
  const normalized = message.toLowerCase();
  if (error instanceof ApiError && error.status === 0) {
    return true;
  }
  if (error instanceof TypeError) {
    return includesAny(normalized, ["failed to fetch", "network", "load failed", "fetch"]);
  }
  return includesAny(normalized, [
    "falha de comunicacao",
    "temporaria",
    "timeout",
    "conexao",
    "network"
  ]);
}

function isInvalidFileError(error: unknown, message: string): boolean {
  const normalized = message.toLowerCase();
  if (
    error instanceof ApiError &&
    (error.status === 400 ||
      error.status === 413 ||
      error.status === 415 ||
      error.status === 422)
  ) {
    return true;
  }
  return includesAny(normalized, [
    "arquivo",
    "pdf",
    "formato",
    "nao suportado",
    "unsupported",
    "invalido",
    "mb"
  ]);
}

function networkGuidance(): ErrorGuidance {
  return {
    title: "Falha de comunicacao com a API",
    description:
      "Nao foi possivel concluir a solicitacao. Isso pode ocorrer por indisponibilidade da API, bloqueio de CORS ou configuracao incorreta da URL.",
    nextStep: `Verifique se ${API_BASE_URL}/health responde e se o CORS permite este dominio, depois tente novamente.`
  };
}

function unexpectedGuidance(): ErrorGuidance {
  return {
    title: "Nao foi possivel concluir esta etapa",
    description: "Ocorreu um erro inesperado durante o processamento.",
    nextStep: "Tente novamente ou recarregue a pagina."
  };
}

export function getErrorGuidance(context: ErrorContext, error?: unknown): ErrorGuidance {
  const message = toMessage(error);

  if (context === "invalid_document") {
    return {
      title: "Documento invalido",
      description: "Nao foi possivel identificar o documento solicitado.",
      nextStep: "Volte ao inicio e envie o PDF novamente."
    };
  }

  if (context === "frontend") {
    return {
      title: "Ocorreu um erro inesperado",
      description: "A interface encontrou uma falha e nao conseguiu continuar.",
      nextStep: "Recarregue a pagina ou volte ao inicio."
    };
  }

  if (isNetworkError(error, message)) {
    return networkGuidance();
  }

  if (context === "upload" && isInvalidFileError(error, message)) {
    return {
      title: "Arquivo invalido ou nao suportado",
      description: "Nao foi possivel processar este arquivo no formato atual.",
      nextStep: "Envie outro PDF valido ou recarregue a pagina."
    };
  }

  if (context === "analysis") {
    return {
      title: "Falha ao analisar o PDF",
      description: "Nao conseguimos concluir a analise e geracao das imagens deste documento.",
      nextStep: "Tente novamente. Se o erro persistir, envie outro PDF ou recarregue a pagina."
    };
  }

  if (context === "transcription") {
    return {
      title: "Falha na transcricao",
      description: "A transcricao foi interrompida antes de concluir todas as imagens.",
      nextStep: "Tente novamente ou volte para revisar as imagens selecionadas."
    };
  }

  if (context === "results") {
    return {
      title: "Falha ao carregar resultados",
      description: "Nao foi possivel carregar os resultados da transcricao neste momento.",
      nextStep: "Tente carregar novamente os resultados ou recarregue a pagina."
    };
  }

  return unexpectedGuidance();
}
