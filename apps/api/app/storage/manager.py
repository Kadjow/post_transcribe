import json
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.utils.files import ensure_directory


class StorageManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._ensure_base_dirs()

    def _ensure_base_dirs(self) -> None:
        ensure_directory(self.settings.uploads_dir)
        ensure_directory(self.settings.extracted_dir)
        ensure_directory(self.settings.thumbnails_dir)
        ensure_directory(self.settings.results_dir)

    def ensure_document_dirs(self, document_id: str) -> None:
        ensure_directory(self.settings.uploads_dir / document_id)
        ensure_directory(self.settings.extracted_dir / document_id)
        ensure_directory(self.settings.thumbnails_dir / document_id)

    def upload_pdf_path(self, document_id: str) -> Path:
        return self.settings.uploads_dir / document_id / "source.pdf"

    def extracted_image_path(self, document_id: str, filename: str) -> Path:
        return self.settings.extracted_dir / document_id / filename

    def thumbnail_path(self, document_id: str, filename: str) -> Path:
        return self.settings.thumbnails_dir / document_id / filename

    def result_path(self, document_id: str) -> Path:
        return self.settings.results_dir / f"{document_id}.json"

    def public_extracted_url(self, document_id: str, filename: str) -> str:
        return f"/static/extracted/{document_id}/{filename}"

    def public_thumbnail_url(self, document_id: str, filename: str) -> str:
        return f"/static/thumbnails/{document_id}/{filename}"

    def write_json(self, path: Path, payload: dict[str, Any]) -> None:
        ensure_directory(path.parent)
        temp_path = path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp_path.replace(path)

    def read_json(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
