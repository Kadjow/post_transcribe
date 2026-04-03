import type {
  DocumentProcessingStatus,
  DocumentResult,
  OcrStatus,
  ProcessingStage
} from "../types/api";

const STAGE_LABELS: Record<ProcessingStage, string> = {
  uploaded: "Upload concluido",
  analyzing_pdf: "Analisando PDF",
  extracting_images: "Extraindo imagens",
  generating_thumbnails: "Gerando miniaturas",
  ready_for_selection: "Pronto para selecao do usuario",
  ocr_running: "Transcricao em andamento",
  cancelled: "Transcricao cancelada",
  completed: "Concluido",
  completed_with_errors: "Concluido com erros",
  failed: "Falhou"
};

const ANALYSIS_IN_PROGRESS_STAGES: ProcessingStage[] = [
  "uploaded",
  "analyzing_pdf",
  "extracting_images",
  "generating_thumbnails"
];

const ANALYSIS_COMPLETED_STAGES: ProcessingStage[] = [
  "ready_for_selection",
  "ocr_running",
  "cancelled",
  "completed",
  "completed_with_errors"
];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value);
}

export function processingStageLabel(stage: ProcessingStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function processingTone(
  stage: ProcessingStage
): "neutral" | "success" | "warning" | "danger" {
  if (stage === "completed" || stage === "ready_for_selection") {
    return "success";
  }
  if (stage === "completed_with_errors" || stage === "cancelled") {
    return "warning";
  }
  if (stage === "failed") {
    return "danger";
  }
  if (stage === "ocr_running" || stage === "extracting_images" || stage === "generating_thumbnails") {
    return "warning";
  }
  return "neutral";
}

export function ocrTone(status: OcrStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "DONE") {
    return "success";
  }
  if (status === "LOW_CONFIDENCE" || status === "NO_TEXT" || status === "PENDING") {
    return "warning";
  }
  if (status === "PROCESSING") {
    return "neutral";
  }
  if (status === "CANCELLED") {
    return "warning";
  }
  if (status === "ERROR") {
    return "danger";
  }
  return "neutral";
}

export function progressValue(processing: DocumentProcessingStatus | null): number {
  if (!processing) {
    return 0;
  }
  return clampPercent(processing.progress);
}

export function analysisProgressValue(processing: DocumentProcessingStatus | null): number {
  if (!processing) {
    return 0;
  }
  if (ANALYSIS_COMPLETED_STAGES.includes(processing.stage)) {
    return 100;
  }

  const totalPages = safeCount(processing.totalPages);
  const pagesProcessed = safeCount(processing.pagesProcessed);
  if (totalPages > 0) {
    return clampPercent((Math.min(pagesProcessed, totalPages) / totalPages) * 100);
  }

  if (processing.stage === "analyzing_pdf") {
    return 15;
  }
  if (
    processing.stage === "extracting_images" ||
    processing.stage === "generating_thumbnails"
  ) {
    return 35;
  }
  return 0;
}

export function ocrProgressValue(
  processing: DocumentProcessingStatus | null,
  result: DocumentResult | null
): number {
  if (!processing) {
    return 0;
  }
  if (result?.status.transcription === "COMPLETED" || result?.status.transcription === "CANCELLED") {
    return 100;
  }
  const selected = safeCount(processing.imagesSelected);
  if (selected <= 0) {
    return 0;
  }
  const processed = safeCount(processing.imagesProcessed);
  const value = (Math.min(processed, selected) / selected) * 100;
  return clampPercent(value);
}

export function analysisStatusLabel(
  processing: DocumentProcessingStatus | null,
  result: DocumentResult | null
): string {
  if (!processing) {
    return "Aguardando status da analise";
  }
  const totalPages = safeCount(processing.totalPages);
  const pagesProcessed = safeCount(processing.pagesProcessed);
  const cappedPagesProcessed =
    totalPages > 0 ? Math.min(pagesProcessed, totalPages) : pagesProcessed;

  if (result?.status.analysis === "FAILED") {
    return "Falhou";
  }
  if (
    result?.status.analysis === "COMPLETED" ||
    ANALYSIS_COMPLETED_STAGES.includes(processing.stage)
  ) {
    if (totalPages > 0) {
      return `Concluida (${totalPages}/${totalPages} paginas)`;
    }
    return "Concluida";
  }
  if (processing.stage === "uploaded") {
    return "Nao iniciada";
  }
  if (totalPages > 0) {
    return `Em andamento (${cappedPagesProcessed}/${totalPages} paginas)`;
  }
  return "Em andamento";
}

export function ocrStatusLabel(
  processing: DocumentProcessingStatus | null,
  result: DocumentResult | null
): string {
  if (!processing) {
    return "Aguardando status da transcricao";
  }
  const selected = safeCount(processing.imagesSelected);
  const processed = safeCount(processing.imagesProcessed);
  const failed = safeCount(processing.imagesFailed);
  const cancelled = safeCount(processing.imagesCancelled);
  const processedText = `${Math.min(processed, selected)}/${selected} imagens`;

  if (result?.status.transcription === "IDLE") {
    return "Transcricao nao iniciada";
  }
  if (result?.status.transcription === "IN_PROGRESS" || processing.stage === "ocr_running") {
    if (selected <= 0) {
      return "Processando";
    }
    return `Processando (${processedText})`;
  }
  if (result?.status.transcription === "FAILED") {
    if (selected <= 0) {
      return "Erro";
    }
    return `Erro (${processedText})`;
  }
  if (result?.status.transcription === "CANCELLED" || processing.stage === "cancelled") {
    return `Cancelada (${cancelled} imagem(ns))`;
  }
  if (result?.status.transcription === "COMPLETED") {
    if (selected <= 0 && cancelled <= 0) {
      return "Transcricao nao iniciada";
    }
    if (failed > 0) {
      return `Concluida com erros (${processedText})`;
    }
    if (cancelled > 0 && selected <= 0) {
      return `Cancelada (${cancelled} imagem(ns))`;
    }
    if (cancelled > 0) {
      return `Concluida com cancelamentos (${processedText})`;
    }
    return `Concluida (${processedText})`;
  }
  if (selected <= 0 && cancelled > 0) {
    return `Cancelada (${cancelled} imagem(ns))`;
  }
  if (selected <= 0) {
    return "Transcricao nao iniciada";
  }
  return `${processedText} finalizadas`;
}

export function flowStateLabel(
  processing: DocumentProcessingStatus | null,
  result: DocumentResult | null
): string {
  if (!processing) {
    return "Aguardando status";
  }

  if (ANALYSIS_IN_PROGRESS_STAGES.includes(processing.stage)) {
    return "Analise em andamento";
  }
  if (processing.stage === "ready_for_selection") {
    return "Aguardando selecao de imagens";
  }
  if (processing.stage === "ocr_running") {
    return "Transcricao em andamento";
  }
  if (processing.stage === "cancelled") {
    return "Transcricao cancelada";
  }
  if (processing.stage === "completed") {
    return processing.imagesSelected > 0 ? "Fluxo concluido" : "Concluido sem transcricao";
  }
  if (processing.stage === "completed_with_errors") {
    return "Concluido com erros";
  }
  if (processing.stage === "failed") {
    return result?.status.analysis === "FAILED"
      ? "Falha na analise"
      : "Falha na transcricao";
  }
  return "Aguardando status";
}

export function flowStateDescription(
  processing: DocumentProcessingStatus | null,
  result: DocumentResult | null
): string {
  if (!processing) {
    return "Aguardando atualizacao de status.";
  }

  if (ANALYSIS_IN_PROGRESS_STAGES.includes(processing.stage)) {
    return "Analise do PDF em andamento. A transcricao ainda nao foi iniciada.";
  }
  if (processing.stage === "ready_for_selection") {
    return "Analise concluida. Selecione as imagens para iniciar a transcricao.";
  }
  if (processing.stage === "ocr_running") {
    return "Transcricao em andamento nas imagens selecionadas.";
  }
  if (processing.stage === "cancelled") {
    return "Transcricao cancelada para todas as imagens elegiveis.";
  }
  if (processing.stage === "completed") {
    if (processing.imagesSelected <= 0) {
      return "Processo concluido sem transcricao porque nenhuma imagem permaneceu selecionada.";
    }
    return "Processo concluido com transcricao finalizada.";
  }
  if (processing.stage === "completed_with_errors") {
    return "Transcricao finalizada com erros em parte das imagens selecionadas.";
  }
  if (processing.stage === "failed") {
    return result?.status.analysis === "FAILED"
      ? "A analise falhou e a transcricao nao foi iniciada."
      : "A transcricao falhou durante a execucao.";
  }
  return processing.message;
}

export function isWaitingForUserSelection(
  processing: DocumentProcessingStatus | null,
  result: DocumentResult | null
): boolean {
  if (!processing) {
    return false;
  }
  return processing.stage === "ready_for_selection" && result?.status.transcription !== "IN_PROGRESS";
}
