import logging
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)

from app.schemas.pdfs import (
    AnalyzePdfResponse,
    DocumentProcessingStatusSchema,
    DocumentResultSchema,
    StartTranscriptionRequest,
    StartTranscriptionResponse,
)
from app.services.ocr.tesseract_service import OcrDependencyError
from app.utils.files import save_upload_file
from app.utils.ids import generate_document_id

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_document_service(request: Request):
    return request.app.state.document_service


def _get_storage_manager(request: Request):
    return request.app.state.storage_manager


def _run_analysis_task(app_state: Any, document_id: str, thumbnail_width: int) -> None:
    document_service = app_state.document_service
    pdf_service = app_state.pdf_service
    storage_manager = app_state.storage_manager
    pdf_path = storage_manager.upload_pdf_path(document_id)

    try:
        document_service.mark_analysis_started(document_id)

        def _on_progress(event: dict[str, Any]) -> None:
            event_name = str(event.get("event", ""))
            total_pages = int(event.get("totalPages") or 0)
            pages_processed = int(event.get("pagesProcessed") or 0)
            images_found = int(event.get("imagesFound") or 0)
            page_number = int(event.get("pageNumber") or 0)

            if event_name == "analysis_started":
                message = "Analyzing PDF metadata."
                stage = "analyzing_pdf"
            elif event_name == "page_started":
                message = f"Extracting images from page {page_number}/{max(total_pages, 1)}."
                stage = "extracting_images"
            elif event_name == "thumbnail_started":
                message = (
                    f"Generating thumbnail for page {page_number}/{max(total_pages, 1)}."
                )
                stage = "generating_thumbnails"
            elif event_name == "page_completed":
                message = (
                    f"Processed page {pages_processed}/{max(total_pages, 1)} during extraction."
                )
                stage = "extracting_images"
            else:
                return

            document_service.update_analysis_progress(
                document_id,
                stage=stage,
                message=message,
                total_pages=total_pages,
                pages_processed=pages_processed,
                images_found=images_found,
            )

        pages = pdf_service.extract_images(
            document_id,
            pdf_path,
            thumbnail_width,
            on_progress=_on_progress,
        )
        document_service.complete_analysis(document_id, pages)
    except Exception as exc:
        logger.exception("Failed to analyze document %s", document_id)
        document_service.fail_analysis(document_id, str(exc))


def _run_transcription_task(app_state: Any, document_id: str, ocr_languages: str) -> None:
    document_service = app_state.document_service
    ocr_service = app_state.ocr_service

    try:
        selected_images = document_service.selected_images_for_ocr(document_id)
        if not selected_images:
            document_service.mark_transcription_completed(document_id)
            return

        try:
            ocr_service.ensure_available()
        except OcrDependencyError as dependency_error:
            dependency_message = str(dependency_error)
            for image_id, _ in selected_images:
                document_service.update_ocr_result(
                    document_id,
                    image_id,
                    "ERROR",
                    "",
                    None,
                    strategy_used=None,
                    preprocessing_used=None,
                    error=dependency_message,
                )
            document_service.mark_transcription_completed(document_id)
            return

        for image_id, image_path in selected_images:
            try:
                ocr_result = ocr_service.transcribe(image_path, ocr_languages)
                document_service.update_ocr_result(
                    document_id,
                    image_id,
                    ocr_result.status,
                    ocr_result.text,
                    ocr_result.confidence,
                    strategy_used=ocr_result.strategy_used,
                    preprocessing_used=ocr_result.preprocessing_used,
                    error=ocr_result.error,
                )
            except Exception as image_exc:
                logger.exception(
                    "Failed OCR for image %s (document %s)", image_id, document_id
                )
                document_service.update_ocr_result(
                    document_id,
                    image_id,
                    "ERROR",
                    "",
                    None,
                    strategy_used=None,
                    preprocessing_used=None,
                    error=f"OCR failed for image {image_id}: {image_exc}",
                )

        document_service.mark_transcription_completed(document_id)
    except Exception as exc:
        logger.exception("Failed to transcribe document %s", document_id)
        document_service.fail_transcription(document_id, str(exc))


@router.post(
    "/analyze",
    response_model=AnalyzePdfResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def analyze_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    ocrLanguages: str = Form("por+eng"),
    thumbnailWidth: int = Form(320),
) -> AnalyzePdfResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted.",
        )

    document_id = generate_document_id()
    storage_manager = _get_storage_manager(request)
    settings = request.app.state.settings
    storage_manager.ensure_document_dirs(document_id)
    destination = storage_manager.upload_pdf_path(document_id)

    try:
        await save_upload_file(file, destination, settings.max_upload_size_bytes)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    document_service = _get_document_service(request)
    document_service.create_document(document_id, ocrLanguages, thumbnailWidth)
    background_tasks.add_task(_run_analysis_task, request.app.state, document_id, thumbnailWidth)

    return AnalyzePdfResponse(
        documentId=document_id,
        status="ANALYZING",
        message="PDF received. Analysis started.",
        links={
            "results": f"/v1/pdfs/{document_id}/results",
            "status": f"/v1/pdfs/{document_id}/status",
        },
    )


@router.post(
    "/transcriptions",
    response_model=StartTranscriptionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_transcriptions(
    payload: StartTranscriptionRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> StartTranscriptionResponse:
    document_service = _get_document_service(request)
    record = document_service.get_record(payload.documentId)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    try:
        accepted_ids = document_service.start_transcription(
            payload.documentId, payload.mode, payload.imageIds, payload.ocrLanguages
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    response_status = "TRANSCRIBING" if accepted_ids else "COMPLETED"
    if accepted_ids:
        background_tasks.add_task(
            _run_transcription_task, request.app.state, payload.documentId, payload.ocrLanguages
        )

    message = (
        "Transcription started."
        if accepted_ids
        else "No image selected for transcription."
    )
    return StartTranscriptionResponse(
        documentId=payload.documentId,
        status=response_status,
        acceptedImageCount=len(accepted_ids),
        message=message,
        links={
            "results": f"/v1/pdfs/{payload.documentId}/results",
            "status": f"/v1/pdfs/{payload.documentId}/status",
        },
    )


@router.get("/{document_id}/status", response_model=DocumentProcessingStatusSchema)
async def get_processing_status(
    document_id: str, request: Request
) -> DocumentProcessingStatusSchema:
    document_service = _get_document_service(request)
    record = document_service.get_processing_status(document_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return DocumentProcessingStatusSchema(**record)


@router.get("/{document_id}/results", response_model=DocumentResultSchema)
async def get_results(document_id: str, request: Request) -> DocumentResultSchema:
    document_service = _get_document_service(request)
    record = document_service.get_public_record(document_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return DocumentResultSchema(**record)
