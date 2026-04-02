from typing import Literal

from pydantic import BaseModel, Field, model_validator


AnalysisStatus = Literal["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]
TranscriptionStatus = Literal["IDLE", "IN_PROGRESS", "COMPLETED", "FAILED"]
ProcessingStage = Literal[
    "uploaded",
    "analyzing_pdf",
    "extracting_images",
    "generating_thumbnails",
    "ready_for_selection",
    "ocr_running",
    "completed",
    "completed_with_errors",
    "failed",
]
OcrStatus = Literal[
    "NOT_REQUESTED",
    "PENDING",
    "DONE",
    "LOW_CONFIDENCE",
    "NO_TEXT",
    "ERROR",
]
TranscriptionMode = Literal["ALL", "NONE", "SELECTED"]


class AnalyzePdfResponse(BaseModel):
    documentId: str
    status: Literal["ANALYZING"]
    message: str
    links: dict[str, str]


class StartTranscriptionRequest(BaseModel):
    documentId: str
    mode: TranscriptionMode
    imageIds: list[str] = Field(default_factory=list)
    ocrLanguages: str = "por+eng"

    @model_validator(mode="after")
    def validate_selection(self) -> "StartTranscriptionRequest":
        if self.mode == "SELECTED" and not self.imageIds:
            raise ValueError("imageIds must be provided when mode is SELECTED.")
        return self


class StartTranscriptionResponse(BaseModel):
    documentId: str
    status: Literal["TRANSCRIBING", "COMPLETED"]
    acceptedImageCount: int
    message: str
    links: dict[str, str]


class DocumentProcessingStatusSchema(BaseModel):
    documentId: str
    stage: ProcessingStage
    message: str
    progress: float
    hasError: bool
    errorMessage: str | None = None
    totalPages: int
    pagesProcessed: int
    imagesFound: int
    imagesSelected: int
    imagesProcessed: int
    imagesSucceeded: int
    imagesFailed: int
    updatedAt: str


class OcrResultSchema(BaseModel):
    imageId: str
    status: OcrStatus
    text: str
    confidence: float | None = None
    strategyUsed: str | None = None
    preprocessingUsed: str | None = None
    error: str | None = None


class ImageResultSchema(BaseModel):
    id: str
    page: int
    imageUrl: str
    thumbnailUrl: str
    width: int
    height: int
    selectedForTranscription: bool
    ocr: OcrResultSchema


class PageResultSchema(BaseModel):
    page: int
    images: list[ImageResultSchema]


class DocumentResultSchema(BaseModel):
    documentId: str
    status: dict[str, AnalysisStatus | TranscriptionStatus]
    processing: DocumentProcessingStatusSchema
    summary: dict[str, int]
    pages: list[PageResultSchema]
    updatedAt: str
    error: str | None = None
