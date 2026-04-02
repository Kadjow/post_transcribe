from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


OcrStatus = Literal["DONE", "LOW_CONFIDENCE", "NO_TEXT", "ERROR"]
OcrLayoutBlockType = Literal["text", "image"]


@dataclass(slots=True, frozen=True)
class OcrLayoutBlock:
    type: OcrLayoutBlockType
    bbox: tuple[int, int, int, int]
    text: str | None = None

    def to_payload(self) -> dict[str, str | list[int] | None]:
        payload: dict[str, str | list[int] | None] = {
            "type": self.type,
            "bbox": list(self.bbox),
        }
        if self.text is not None:
            payload["text"] = self.text
        return payload


@dataclass(slots=True)
class OcrTranscriptionResult:
    status: OcrStatus
    text: str
    confidence: float | None = None
    strategy_used: str | None = None
    preprocessing_used: str | None = None
    error: str | None = None
    layout_blocks: list[OcrLayoutBlock] | None = None


class OcrService(ABC):
    @abstractmethod
    def ensure_available(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def transcribe(self, image_path: Path, languages: str) -> OcrTranscriptionResult:
        raise NotImplementedError
