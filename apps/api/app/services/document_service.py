from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any, Callable

from app.storage.manager import StorageManager


PROCESSING_STAGES = {
    "uploaded",
    "analyzing_pdf",
    "extracting_images",
    "generating_thumbnails",
    "ready_for_selection",
    "ocr_running",
    "completed",
    "completed_with_errors",
    "failed",
}

OCR_SUCCESS_STATUSES = {"DONE", "LOW_CONFIDENCE", "NO_TEXT"}
OCR_PROCESSED_STATUSES = OCR_SUCCESS_STATUSES | {"ERROR"}


class DocumentService:
    def __init__(self, storage_manager: StorageManager):
        self.storage_manager = storage_manager
        self._lock = Lock()

    def create_document(
        self, document_id: str, ocr_languages: str, thumbnail_width: int
    ) -> dict[str, Any]:
        timestamp = self._timestamp()
        record = {
            "documentId": document_id,
            "status": {"analysis": "PENDING", "transcription": "IDLE"},
            "processing": self._processing_defaults(document_id, timestamp),
            "summary": {
                "pagesTotal": 0,
                "imagesTotal": 0,
                "selectedForTranscription": 0,
                "transcribedTotal": 0,
                "lowConfidenceTotal": 0,
                "noTextTotal": 0,
            },
            "pages": [],
            "updatedAt": timestamp,
            "error": None,
            "settings": {
                "ocrLanguages": ocr_languages,
                "thumbnailWidth": thumbnail_width,
            },
        }
        self._save_record(document_id, record)
        return self.public_view(record)

    def get_record(self, document_id: str) -> dict[str, Any] | None:
        path = self.storage_manager.result_path(document_id)
        return self.storage_manager.read_json(path)

    def get_public_record(self, document_id: str) -> dict[str, Any] | None:
        record = self.get_record(document_id)
        if not record:
            return None
        return self.public_view(record)

    def get_processing_status(self, document_id: str) -> dict[str, Any] | None:
        record = self.get_record(document_id)
        if not record:
            return None
        self._ensure_processing(record)
        return deepcopy(record["processing"])

    def mark_analysis_started(self, document_id: str) -> None:
        def _mutate(record: dict[str, Any]) -> None:
            record["status"].update({"analysis": "IN_PROGRESS"})
            self._set_processing(
                record,
                stage="analyzing_pdf",
                message="Analyzing PDF structure.",
                has_error=False,
                error_message=None,
            )

        self.mutate_record(document_id, _mutate)

    def update_analysis_progress(
        self,
        document_id: str,
        *,
        stage: str,
        message: str,
        total_pages: int | None = None,
        pages_processed: int | None = None,
        images_found: int | None = None,
    ) -> None:
        if stage not in PROCESSING_STAGES:
            raise ValueError(f"Unsupported processing stage: {stage}")

        def _mutate(record: dict[str, Any]) -> None:
            processing = self._ensure_processing(record)
            if total_pages is not None:
                processing["totalPages"] = max(int(total_pages), 0)
            if pages_processed is not None:
                processing["pagesProcessed"] = max(int(pages_processed), 0)
            if images_found is not None:
                processing["imagesFound"] = max(int(images_found), 0)

            total = max(int(processing["totalPages"]), 0)
            if total > 0:
                processing["pagesProcessed"] = min(int(processing["pagesProcessed"]), total)

            self._set_processing(
                record,
                stage=stage,
                message=message,
                has_error=False,
                error_message=None,
            )

        self.mutate_record(document_id, _mutate)

    def complete_analysis(self, document_id: str, pages: list[dict[str, Any]]) -> None:
        def _mutate(record: dict[str, Any]) -> None:
            record["pages"] = pages
            record["status"]["analysis"] = "COMPLETED"
            record["error"] = None
            self._recalculate_summary(record)
            self._set_processing(
                record,
                stage="ready_for_selection",
                message="Images are ready. Select which ones should run OCR.",
                has_error=False,
                error_message=None,
            )

        self.mutate_record(document_id, _mutate)

    def fail_analysis(self, document_id: str, error_message: str) -> None:
        def _mutate(record: dict[str, Any]) -> None:
            record["status"]["analysis"] = "FAILED"
            record["error"] = error_message
            self._set_processing(
                record,
                stage="failed",
                message="Failed to analyze PDF.",
                has_error=True,
                error_message=error_message,
            )

        self.mutate_record(document_id, _mutate)

    def start_transcription(
        self,
        document_id: str,
        mode: str,
        image_ids: list[str],
        ocr_languages: str,
    ) -> list[str]:
        accepted_ids: list[str] = []

        def _mutate(record: dict[str, Any]) -> None:
            nonlocal accepted_ids
            if record["status"]["analysis"] != "COMPLETED":
                raise ValueError("Document analysis is not completed yet.")

            all_images = self._flatten_images(record)
            image_lookup = {image["id"]: image for image in all_images}

            if mode == "ALL":
                accepted_ids = list(image_lookup.keys())
            elif mode == "NONE":
                accepted_ids = []
            elif mode == "SELECTED":
                missing = [image_id for image_id in image_ids if image_id not in image_lookup]
                if missing:
                    raise ValueError(f"Invalid imageIds for this document: {missing}")
                accepted_ids = list(dict.fromkeys(image_ids))
            else:
                raise ValueError(f"Unsupported mode: {mode}")

            accepted_set = set(accepted_ids)
            for image in all_images:
                is_selected = image["id"] in accepted_set
                image["selectedForTranscription"] = is_selected
                if is_selected:
                    image["ocr"] = {
                        "imageId": image["id"],
                        "status": "PENDING",
                        "text": "",
                        "confidence": None,
                        "strategyUsed": None,
                        "preprocessingUsed": None,
                        "error": None,
                    }
                else:
                    image["ocr"] = {
                        "imageId": image["id"],
                        "status": "NOT_REQUESTED",
                        "text": "",
                        "confidence": None,
                        "strategyUsed": None,
                        "preprocessingUsed": None,
                        "error": None,
                    }

            record["settings"]["ocrLanguages"] = ocr_languages
            record["status"]["transcription"] = (
                "IN_PROGRESS" if len(accepted_ids) > 0 else "COMPLETED"
            )
            record["error"] = None
            self._recalculate_summary(record)

            if accepted_ids:
                self._set_processing(
                    record,
                    stage="ocr_running",
                    message=f"OCR started for {len(accepted_ids)} image(s).",
                    has_error=False,
                    error_message=None,
                )
            else:
                self._set_processing(
                    record,
                    stage="completed",
                    message="No images selected. Processing finished.",
                    has_error=False,
                    error_message=None,
                    progress=100.0,
                )

        self.mutate_record(document_id, _mutate)
        return accepted_ids

    def selected_images_for_ocr(self, document_id: str) -> list[tuple[str, Path]]:
        record = self.get_record(document_id)
        if not record:
            return []

        selected: list[tuple[str, Path]] = []
        for image in self._flatten_images(record):
            if image.get("selectedForTranscription"):
                image_path = image.get("_storage", {}).get("imagePath")
                if image_path:
                    selected.append((image["id"], Path(image_path)))
        return selected

    def update_ocr_result(
        self,
        document_id: str,
        image_id: str,
        status: str,
        text: str,
        confidence: float | None,
        strategy_used: str | None = None,
        preprocessing_used: str | None = None,
        error: str | None = None,
    ) -> None:
        def _mutate(record: dict[str, Any]) -> None:
            image = self._find_image(record, image_id)
            if image is None:
                raise ValueError(f"Image {image_id} not found in document {document_id}.")
            image["ocr"] = {
                "imageId": image_id,
                "status": status,
                "text": text,
                "confidence": confidence,
                "strategyUsed": strategy_used,
                "preprocessingUsed": preprocessing_used,
                "error": error,
            }
            record["error"] = None
            self._recalculate_summary(record)

            processing = self._ensure_processing(record)
            processed = processing["imagesProcessed"]
            selected = processing["imagesSelected"]
            failed = processing["imagesFailed"]
            in_progress_message = f"OCR in progress: {processed}/{selected} image(s) processed."
            error_message = None
            if failed > 0:
                in_progress_message = (
                    f"OCR in progress with errors: {processed}/{selected} image(s) processed."
                )
                error_message = (
                    error
                    or str(processing.get("errorMessage") or "")
                    or "Some images failed during OCR."
                )

            self._set_processing(
                record,
                stage="ocr_running",
                message=in_progress_message,
                has_error=failed > 0,
                error_message=error_message,
            )

        self.mutate_record(document_id, _mutate)

    def mark_transcription_completed(self, document_id: str) -> None:
        def _mutate(record: dict[str, Any]) -> None:
            self._recalculate_summary(record)
            processing = self._ensure_processing(record)

            selected = int(processing["imagesSelected"])
            failed = int(processing["imagesFailed"])
            succeeded = int(processing["imagesSucceeded"])

            if selected == 0:
                record["status"]["transcription"] = "COMPLETED"
                record["error"] = None
                self._set_processing(
                    record,
                    stage="completed",
                    message="No images selected. Processing finished.",
                    has_error=False,
                    error_message=None,
                    progress=100.0,
                )
                return

            if failed == 0:
                record["status"]["transcription"] = "COMPLETED"
                record["error"] = None
                self._set_processing(
                    record,
                    stage="completed",
                    message=f"OCR completed successfully for {succeeded} image(s).",
                    has_error=False,
                    error_message=None,
                    progress=100.0,
                )
                return

            if succeeded > 0:
                error_message = (
                    f"OCR finished with errors: {succeeded} succeeded and {failed} failed."
                )
                record["status"]["transcription"] = "COMPLETED"
                record["error"] = None
                self._set_processing(
                    record,
                    stage="completed_with_errors",
                    message=error_message,
                    has_error=True,
                    error_message=error_message,
                    progress=100.0,
                )
                return

            error_message = "OCR failed for all selected images."
            record["status"]["transcription"] = "FAILED"
            record["error"] = error_message
            self._set_processing(
                record,
                stage="failed",
                message=error_message,
                has_error=True,
                error_message=error_message,
                progress=100.0,
            )

        self.mutate_record(document_id, _mutate)

    def fail_transcription(self, document_id: str, error_message: str) -> None:
        def _mutate(record: dict[str, Any]) -> None:
            record["status"]["transcription"] = "FAILED"
            record["error"] = error_message
            self._set_processing(
                record,
                stage="failed",
                message="Failed to run OCR.",
                has_error=True,
                error_message=error_message,
            )

        self.mutate_record(document_id, _mutate)

    def mutate_record(
        self, document_id: str, mutator: Callable[[dict[str, Any]], None]
    ) -> dict[str, Any]:
        with self._lock:
            record = self.get_record(document_id)
            if not record:
                raise FileNotFoundError(f"Document {document_id} was not found.")
            self._ensure_processing(record)
            mutator(record)
            timestamp = self._timestamp()
            record["updatedAt"] = timestamp
            record["processing"]["updatedAt"] = timestamp
            self._save_record(document_id, record)
            return record

    def public_view(self, record: dict[str, Any]) -> dict[str, Any]:
        payload = deepcopy(record)
        payload.pop("settings", None)
        self._ensure_processing(payload)
        summary = payload.setdefault("summary", {})
        summary.setdefault("pagesTotal", 0)
        summary.setdefault("imagesTotal", 0)
        summary.setdefault("selectedForTranscription", 0)
        summary.setdefault("transcribedTotal", 0)
        summary.setdefault("lowConfidenceTotal", 0)
        summary.setdefault("noTextTotal", 0)
        for page in payload.get("pages", []):
            for image in page.get("images", []):
                if not image.get("thumbnailUrl"):
                    legacy_preview_url = image.get("previewUrl")
                    if legacy_preview_url:
                        image["thumbnailUrl"] = legacy_preview_url
                if not image.get("thumbnailUrl"):
                    image["thumbnailUrl"] = image.get("imageUrl", "")
                image.pop("previewUrl", None)
                if "width" not in image:
                    image["width"] = 0
                if "height" not in image:
                    image["height"] = 0
                image.setdefault("ocr", {})
                image["ocr"].setdefault("imageId", image.get("id", ""))
                image["ocr"].setdefault("strategyUsed", None)
                image["ocr"].setdefault("preprocessingUsed", None)
                image.pop("_storage", None)
        return payload

    def _save_record(self, document_id: str, record: dict[str, Any]) -> None:
        self.storage_manager.write_json(self.storage_manager.result_path(document_id), record)

    def _flatten_images(self, record: dict[str, Any]) -> list[dict[str, Any]]:
        images: list[dict[str, Any]] = []
        for page in record.get("pages", []):
            images.extend(page.get("images", []))
        return images

    def _find_image(self, record: dict[str, Any], image_id: str) -> dict[str, Any] | None:
        for image in self._flatten_images(record):
            if image.get("id") == image_id:
                return image
        return None

    def _recalculate_summary(self, record: dict[str, Any]) -> None:
        pages = record.get("pages", [])
        images = self._flatten_images(record)
        summary = record.setdefault("summary", {})
        summary["pagesTotal"] = len(pages)
        summary["imagesTotal"] = len(images)
        summary["selectedForTranscription"] = sum(
            1 for image in images if image.get("selectedForTranscription")
        )
        summary["transcribedTotal"] = sum(
            1 for image in images if image.get("ocr", {}).get("status") == "DONE"
        )
        summary["lowConfidenceTotal"] = sum(
            1 for image in images if image.get("ocr", {}).get("status") == "LOW_CONFIDENCE"
        )
        summary["noTextTotal"] = sum(
            1 for image in images if image.get("ocr", {}).get("status") == "NO_TEXT"
        )

        processing = self._ensure_processing(record)
        processing["totalPages"] = summary["pagesTotal"]
        processing["imagesFound"] = summary["imagesTotal"]
        processing["imagesSelected"] = summary["selectedForTranscription"]
        processing["imagesSucceeded"] = sum(
            1
            for image in images
            if image.get("selectedForTranscription")
            and image.get("ocr", {}).get("status") in OCR_SUCCESS_STATUSES
        )
        processing["imagesFailed"] = sum(
            1
            for image in images
            if image.get("selectedForTranscription")
            and image.get("ocr", {}).get("status") == "ERROR"
        )
        processing["imagesProcessed"] = sum(
            1
            for image in images
            if image.get("selectedForTranscription")
            and image.get("ocr", {}).get("status") in OCR_PROCESSED_STATUSES
        )

        if record.get("status", {}).get("analysis") == "COMPLETED":
            processing["pagesProcessed"] = processing["totalPages"]
        else:
            processing["pagesProcessed"] = min(
                int(processing.get("pagesProcessed", 0)),
                int(processing["totalPages"]),
            )

    def _set_processing(
        self,
        record: dict[str, Any],
        *,
        stage: str,
        message: str,
        has_error: bool,
        error_message: str | None,
        progress: float | None = None,
    ) -> None:
        if stage not in PROCESSING_STAGES:
            raise ValueError(f"Unsupported processing stage: {stage}")

        processing = self._ensure_processing(record)
        processing["stage"] = stage
        processing["message"] = message
        processing["hasError"] = bool(has_error)
        processing["errorMessage"] = error_message if has_error else None
        if progress is None:
            progress = self._progress_for_stage(stage, processing)
        processing["progress"] = self._clamp_progress(progress)

    def _ensure_processing(self, record: dict[str, Any]) -> dict[str, Any]:
        timestamp = str(record.get("updatedAt") or self._timestamp())
        document_id = str(record.get("documentId") or "")
        processing = record.setdefault(
            "processing", self._processing_defaults(document_id, timestamp)
        )
        defaults = self._processing_defaults(document_id, timestamp)
        for key, value in defaults.items():
            processing.setdefault(key, value)
        processing["documentId"] = document_id
        processing["updatedAt"] = timestamp
        processing["progress"] = self._clamp_progress(processing.get("progress", 0))
        if processing.get("stage") not in PROCESSING_STAGES:
            processing["stage"] = "uploaded"
        return processing

    def _processing_defaults(self, document_id: str, updated_at: str) -> dict[str, Any]:
        return {
            "documentId": document_id,
            "stage": "uploaded",
            "message": "Upload complete. Waiting for analysis.",
            "progress": 5.0,
            "hasError": False,
            "errorMessage": None,
            "totalPages": 0,
            "pagesProcessed": 0,
            "imagesFound": 0,
            "imagesSelected": 0,
            "imagesProcessed": 0,
            "imagesSucceeded": 0,
            "imagesFailed": 0,
            "updatedAt": updated_at,
        }

    @staticmethod
    def _clamp_progress(progress: Any) -> float:
        try:
            value = float(progress)
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(100.0, value))

    @staticmethod
    def _progress_for_stage(stage: str, processing: dict[str, Any]) -> float:
        if stage == "uploaded":
            return 5.0
        if stage == "analyzing_pdf":
            return max(10.0, float(processing.get("progress", 0)))
        if stage in {"extracting_images", "generating_thumbnails"}:
            total_pages = max(int(processing.get("totalPages") or 0), 1)
            pages_processed = min(max(int(processing.get("pagesProcessed") or 0), 0), total_pages)
            ratio = pages_processed / total_pages
            return 10.0 + ratio * 50.0
        if stage == "ready_for_selection":
            return 65.0
        if stage == "ocr_running":
            images_selected = max(int(processing.get("imagesSelected") or 0), 1)
            images_processed = min(
                max(int(processing.get("imagesProcessed") or 0), 0),
                images_selected,
            )
            ratio = images_processed / images_selected
            return 65.0 + ratio * 30.0
        if stage in {"completed", "completed_with_errors", "failed"}:
            return 100.0
        return 0.0

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(UTC).isoformat().replace("+00:00", "Z")
