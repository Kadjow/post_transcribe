export type AnalysisStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type TranscriptionStatus = "IDLE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
export type ProcessingStage =
  | "uploaded"
  | "analyzing_pdf"
  | "extracting_images"
  | "generating_thumbnails"
  | "ready_for_selection"
  | "ocr_running"
  | "completed"
  | "completed_with_errors"
  | "failed";
export type OcrStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "DONE"
  | "LOW_CONFIDENCE"
  | "NO_TEXT"
  | "ERROR";
export type TranscriptionMode = "ALL" | "NONE" | "SELECTED";

export interface AnalyzePdfResponse {
  documentId: string;
  status: "ANALYZING";
  message: string;
  links: {
    results: string;
  };
}

export interface StartTranscriptionRequest {
  documentId: string;
  mode: TranscriptionMode;
  imageIds: string[];
  ocrLanguages?: string;
}

export interface StartTranscriptionResponse {
  documentId: string;
  status: "TRANSCRIBING" | "COMPLETED";
  acceptedImageCount: number;
  message: string;
  links: {
    results: string;
  };
}

export interface DocumentProcessingStatus {
  documentId: string;
  stage: ProcessingStage;
  message: string;
  progress: number;
  hasError: boolean;
  errorMessage: string | null;
  totalPages: number;
  pagesProcessed: number;
  imagesFound: number;
  imagesSelected: number;
  imagesProcessed: number;
  imagesSucceeded: number;
  imagesFailed: number;
  updatedAt: string;
}

export interface OcrResult {
  imageId: string;
  status: OcrStatus;
  text: string;
  confidence: number | null;
  strategyUsed?: string | null;
  preprocessingUsed?: string | null;
  error?: string;
}

export interface DocumentImage {
  id: string;
  page: number;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  selectedForTranscription: boolean;
  ocr: OcrResult;
}

export interface DocumentPage {
  page: number;
  images: DocumentImage[];
}

export interface DocumentResult {
  documentId: string;
  status: {
    analysis: AnalysisStatus;
    transcription: TranscriptionStatus;
  };
  processing: DocumentProcessingStatus;
  summary: {
    pagesTotal: number;
    imagesTotal: number;
    selectedForTranscription: number;
    transcribedTotal: number;
    lowConfidenceTotal: number;
    noTextTotal: number;
  };
  pages: DocumentPage[];
  updatedAt: string;
  error?: string;
}
