from pathlib import Path
import logging
from typing import Any, Callable

import fitz

from app.services.image_service import ImageService
from app.services.thumbnail_service import ThumbnailService
from app.storage.manager import StorageManager


class PdfService:
    def __init__(
        self,
        storage_manager: StorageManager,
        image_service: ImageService,
        thumbnail_service: ThumbnailService,
    ):
        self.storage_manager = storage_manager
        self.image_service = image_service
        self.thumbnail_service = thumbnail_service
        self.logger = logging.getLogger(__name__)

    def extract_images(
        self,
        document_id: str,
        pdf_path: Path,
        thumbnail_width: int,
        on_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> list[dict]:
        pages_payload: list[dict] = []
        images_found = 0

        with fitz.open(pdf_path) as pdf_doc:
            total_pages = pdf_doc.page_count
            if on_progress:
                on_progress(
                    {
                        "event": "analysis_started",
                        "totalPages": total_pages,
                        "pagesProcessed": 0,
                        "imagesFound": images_found,
                    }
                )
            for page_index in range(pdf_doc.page_count):
                page_number = page_index + 1
                if on_progress:
                    on_progress(
                        {
                            "event": "page_started",
                            "pageNumber": page_number,
                            "totalPages": total_pages,
                            "pagesProcessed": page_index,
                            "imagesFound": images_found,
                        }
                    )
                page = pdf_doc.load_page(page_index)
                image_infos = page.get_images(full=True)
                page_images: list[dict] = []
                seen_xrefs: set[int] = set()
                image_counter = 1

                for image_info in image_infos:
                    xref = image_info[0]
                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)

                    image_payload = pdf_doc.extract_image(xref)
                    image_bytes = image_payload.get("image")
                    if not image_bytes:
                        continue
                    images_found += 1

                    file_base = f"p{page_number:03d}_i{image_counter:03d}"
                    image_filename = f"{file_base}.png"
                    thumbnail_filename = f"{file_base}.jpg"
                    image_counter += 1

                    image_path = self.storage_manager.extracted_image_path(
                        document_id, image_filename
                    )
                    preview_path = self.storage_manager.thumbnail_path(
                        document_id, thumbnail_filename
                    )

                    self.image_service.save_extracted_image(image_bytes, image_path)
                    thumbnail_url = self.storage_manager.public_thumbnail_url(
                        document_id, thumbnail_filename
                    )
                    image_url = self.storage_manager.public_extracted_url(
                        document_id, image_filename
                    )
                    if on_progress:
                        on_progress(
                            {
                                "event": "thumbnail_started",
                                "pageNumber": page_number,
                                "totalPages": total_pages,
                                "pagesProcessed": page_index,
                                "imagesFound": images_found,
                            }
                        )
                    try:
                        self.thumbnail_service.create_thumbnail(
                            image_path, preview_path, thumbnail_width
                        )
                    except Exception as exc:
                        # Fallback to the original extracted image URL when thumbnail fails.
                        self.logger.warning(
                            "Thumbnail generation failed for %s: %s",
                            image_path,
                            exc,
                        )
                        thumbnail_url = image_url

                    page_images.append(
                        {
                            "id": f"img_{file_base}",
                            "page": page_number,
                            "thumbnailUrl": thumbnail_url,
                            "imageUrl": image_url,
                            "width": int(image_payload.get("width") or 0),
                            "height": int(image_payload.get("height") or 0),
                            "selectedForTranscription": False,
                            "ocr": {
                                "imageId": f"img_{file_base}",
                                "status": "NOT_REQUESTED",
                                "text": "",
                                "layoutBlocks": [],
                                "confidence": None,
                                "strategyUsed": None,
                                "preprocessingUsed": None,
                                "error": None,
                            },
                            "_storage": {
                                "imagePath": str(image_path),
                                "previewPath": str(preview_path),
                            },
                        }
                    )

                pages_payload.append({"page": page_number, "images": page_images})
                if on_progress:
                    on_progress(
                        {
                            "event": "page_completed",
                            "pageNumber": page_number,
                            "totalPages": total_pages,
                            "pagesProcessed": page_number,
                            "imagesFound": images_found,
                        }
                    )

        return pages_payload
