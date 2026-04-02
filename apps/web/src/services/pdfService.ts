import type {
  AnalyzePdfResponse,
  DocumentProcessingStatus,
  DocumentResult,
  StartTranscriptionRequest,
  StartTranscriptionResponse
} from "../types/api";
import { request } from "./apiClient";

export async function analyzePdf(
  file: File,
  options?: { ocrLanguages?: string; thumbnailWidth?: number }
): Promise<AnalyzePdfResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.ocrLanguages) {
    formData.append("ocrLanguages", options.ocrLanguages);
  }
  if (options?.thumbnailWidth) {
    formData.append("thumbnailWidth", String(options.thumbnailWidth));
  }

  return request<AnalyzePdfResponse>("/v1/pdfs/analyze", {
    method: "POST",
    body: formData
  });
}

export async function startTranscription(
  payload: StartTranscriptionRequest
): Promise<StartTranscriptionResponse> {
  return request<StartTranscriptionResponse>("/v1/pdfs/transcriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function getResults(documentId: string): Promise<DocumentResult> {
  return request<DocumentResult>(`/v1/pdfs/${documentId}/results`);
}

export async function getDocumentStatus(
  documentId: string
): Promise<DocumentProcessingStatus> {
  return request<DocumentProcessingStatus>(`/v1/pdfs/${documentId}/status`);
}
