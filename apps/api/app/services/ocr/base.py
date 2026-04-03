from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


OcrStatus = Literal["DONE", "LOW_CONFIDENCE", "NO_TEXT", "ERROR"]
OcrLayoutBlockType = Literal["text", "image"]
OcrStructuredKind = Literal["slide", "diagram", "mixed_page", "simple_text"]


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


@dataclass(slots=True, frozen=True)
class OcrStructuredContent:
    kind: OcrStructuredKind
    title: str | None = None
    main_text: list[str] | None = None
    figure_labels: list[str] | None = None
    footer: str | None = None
    ascii_map: str | None = None
    figure_detected: bool = False

    def to_payload(self) -> dict[str, str | list[str] | bool | None]:
        return {
            "kind": self.kind,
            "title": self.title,
            "mainText": list(self.main_text or []),
            "figureLabels": list(self.figure_labels or []),
            "footer": self.footer,
            "asciiMap": self.ascii_map,
            "figureDetected": self.figure_detected,
        }


@dataclass(slots=True)
class OcrTranscriptionResult:
    status: OcrStatus
    text: str
    confidence: float | None = None
    strategy_used: str | None = None
    preprocessing_used: str | None = None
    error: str | None = None
    layout_blocks: list[OcrLayoutBlock] | None = None
    structured_content: OcrStructuredContent | None = None


class OcrService(ABC):
    @abstractmethod
    def ensure_available(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def transcribe(self, image_path: Path, languages: str) -> OcrTranscriptionResult:
        raise NotImplementedError
