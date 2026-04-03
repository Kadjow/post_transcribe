from typing import Literal

from pydantic import BaseModel, Field, model_validator


AnalysisStatus = Literal["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]
TranscriptionStatus = Literal["IDLE", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]
ProcessingStage = Literal[
    "uploaded",
    "analyzing_pdf",
    "extracting_images",
    "generating_thumbnails",
    "ready_for_selection",
    "ocr_running",
    "cancelled",
    "completed",
    "completed_with_errors",
    "failed",
]
OcrStatus = Literal[
    "NOT_REQUESTED",
    "PENDING",
    "PROCESSING",
    "DONE",
    "LOW_CONFIDENCE",
    "NO_TEXT",
    "CANCELLED",
    "ERROR",
]
TranscriptionMode = Literal["ALL", "NONE", "SELECTED"]
CancelTranscriptionMode = Literal["ALL", "SELECTED"]


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
            raise ValueError("imageIds deve ser informado quando mode for SELECTED.")
        return self


class StartTranscriptionResponse(BaseModel):
    documentId: str
    status: Literal["TRANSCRIBING", "COMPLETED"]
    acceptedImageCount: int
    message: str
    links: dict[str, str]


class CancelTranscriptionRequest(BaseModel):
    documentId: str
    mode: CancelTranscriptionMode
    imageIds: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_selection(self) -> "CancelTranscriptionRequest":
        if self.mode == "SELECTED" and not self.imageIds:
            raise ValueError("imageIds deve ser informado quando mode for SELECTED.")
        return self


class CancelTranscriptionResponse(BaseModel):
    documentId: str
    status: Literal["TRANSCRIBING", "COMPLETED", "CANCELLED"]
    cancelledImageCount: int
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
    imagesCancelled: int
    updatedAt: str


class OcrLayoutBlockSchema(BaseModel):
    type: Literal["text", "image"]
    bbox: list[int]
    text: str | None = None


class OcrStructuredContentSchema(BaseModel):
    kind: Literal["slide", "diagram", "mixed_page", "simple_text"]
    title: str | None = None
    mainText: list[str] = Field(default_factory=list)
    figureLabels: list[str] = Field(default_factory=list)
    footer: str | None = None
    asciiMap: str | None = None
    figureDetected: bool = False


class OcrResultSchema(BaseModel):
    imageId: str
    status: OcrStatus
    text: str
    layoutBlocks: list[OcrLayoutBlockSchema] = Field(default_factory=list)
    structuredContent: OcrStructuredContentSchema | None = None
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
