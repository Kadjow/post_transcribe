from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


OcrStatus = Literal["DONE", "LOW_CONFIDENCE", "NO_TEXT", "ERROR"]


@dataclass(slots=True)
class OcrTranscriptionResult:
    status: OcrStatus
    text: str
    confidence: float | None = None
    strategy_used: str | None = None
    preprocessing_used: str | None = None
    error: str | None = None


class OcrService(ABC):
    @abstractmethod
    def ensure_available(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def transcribe(self, image_path: Path, languages: str) -> OcrTranscriptionResult:
        raise NotImplementedError
