from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.schemas.common import HealthResponse
from app.services.document_service import DocumentService
from app.services.image_service import ImageService
from app.services.ocr.tesseract_service import TesseractOcrService
from app.services.pdf_service import PdfService
from app.services.thumbnail_service import ThumbnailService
from app.storage.manager import StorageManager

settings = get_settings()
configure_logging()

app = FastAPI(title=settings.app_name)

storage_manager = StorageManager(settings)
document_service = DocumentService(storage_manager)
image_service = ImageService()
thumbnail_service = ThumbnailService()
pdf_service = PdfService(storage_manager, image_service, thumbnail_service)
ocr_service = TesseractOcrService(settings.tesseract_cmd)

app.state.settings = settings
app.state.storage_manager = storage_manager
app.state.document_service = document_service
app.state.pdf_service = pdf_service
app.state.ocr_service = ocr_service

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/static/extracted",
    StaticFiles(directory=settings.extracted_dir),
    name="static-extracted",
)
app.mount(
    "/static/thumbnails",
    StaticFiles(directory=settings.thumbnails_dir),
    name="static-thumbnails",
)

app.include_router(v1_router, prefix="/v1")


@app.get("/health", response_model=HealthResponse)
def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok")
