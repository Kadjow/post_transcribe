import re
from dataclasses import dataclass, replace
from pathlib import Path
from shutil import which
from typing import Any

import pytesseract

from app.services.ocr.base import OcrService, OcrTranscriptionResult
from app.services.ocr.layout_structure_service import LayoutStructureService
from app.utils.images import OcrImageVariant, build_ocr_variants


class OcrDependencyError(RuntimeError):
    pass


@dataclass(slots=True, frozen=True)
class OcrAttemptStrategy:
    name: str
    psm: int
    extra_config: str = ""

    def config(self) -> str:
        base = f"--oem 3 --psm {self.psm}"
        if self.extra_config:
            return f"{base} {self.extra_config}".strip()
        return base


@dataclass(slots=True)
class OcrAttemptResult:
    text: str
    confidence: float | None
    strategy: str
    preprocessing: str
    quality_score: float
    valid_char_ratio: float
    symbol_ratio: float
    compact_length: int
    has_alnum: bool


class TesseractOcrService(OcrService):
    def __init__(self, tesseract_cmd: str | None = None):
        self.tesseract_cmd = tesseract_cmd or self._discover_windows_tesseract()
        self.layout_service = LayoutStructureService()
        if self.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self.tesseract_cmd

    def ensure_available(self) -> None:
        try:
            _ = pytesseract.get_tesseract_version()
        except (pytesseract.TesseractNotFoundError, OSError) as exc:
            resolved_cmd = self.tesseract_cmd or which("tesseract")
            configured_hint = (
                f" Current TESSERACT_CMD='{self.tesseract_cmd}'."
                if self.tesseract_cmd
                else " You can set TESSERACT_CMD in .env to the full executable path."
            )
            raise OcrDependencyError(
                "OCR dependency unavailable: Tesseract executable not found in PATH."
                f" Resolved command: {resolved_cmd!r}."
                + configured_hint
            ) from exc

    def transcribe(self, image_path: Path, languages: str) -> OcrTranscriptionResult:
        variants, has_dark_background_hint = build_ocr_variants(image_path)
        strategies = self._build_strategies()
        attempt_plan = self._build_attempt_plan(
            variants=variants,
            strategies=strategies,
            has_dark_background_hint=has_dark_background_hint,
        )
        attempts: list[OcrAttemptResult] = []
        last_error: Exception | None = None

        try:
            for variant, strategy in attempt_plan:
                try:
                    attempt = self._run_attempt(variant, strategy, languages)
                    if attempt is not None:
                        attempts.append(attempt)
                except Exception as exc:
                    last_error = exc
        finally:
            for variant in variants:
                variant.image.close()

        if attempts:
            result = self._select_best_result(attempts)
            return self._attach_layout_blocks(image_path, languages, result)

        if last_error is not None:
            return OcrTranscriptionResult(
                status="ERROR",
                text="",
                confidence=None,
                error=f"OCR failed: {last_error}",
            )

        return OcrTranscriptionResult(status="NO_TEXT", text="", confidence=None)

    def _attach_layout_blocks(
        self, image_path: Path, languages: str, result: OcrTranscriptionResult
    ) -> OcrTranscriptionResult:
        try:
            layout_blocks = self.layout_service.extract_blocks(image_path, languages)
        except Exception:
            return result
        if not layout_blocks:
            return result
        return replace(result, layout_blocks=layout_blocks)

    def _run_attempt(
        self, variant: OcrImageVariant, strategy: OcrAttemptStrategy, languages: str
    ) -> OcrAttemptResult | None:
        data = pytesseract.image_to_data(
            variant.image,
            lang=languages,
            config=strategy.config(),
            output_type=pytesseract.Output.DICT,
        )
        text = self._normalize_text(self._extract_text(data))
        if not text:
            return None

        confidence = self._calculate_confidence(data.get("conf", []))
        metrics = self._text_metrics(text)
        quality_score = self._score_candidate(
            confidence=confidence,
            valid_char_ratio=metrics["valid_char_ratio"],
            symbol_ratio=metrics["symbol_ratio"],
            compact_length=metrics["compact_length"],
            token_count=metrics["token_count"],
            single_char_ratio=metrics["single_char_ratio"],
        )
        return OcrAttemptResult(
            text=text,
            confidence=confidence,
            strategy=strategy.name,
            preprocessing=variant.name,
            quality_score=quality_score,
            valid_char_ratio=metrics["valid_char_ratio"],
            symbol_ratio=metrics["symbol_ratio"],
            compact_length=metrics["compact_length"],
            has_alnum=metrics["has_alnum"],
        )

    def _select_best_result(self, attempts: list[OcrAttemptResult]) -> OcrTranscriptionResult:
        best = max(
            attempts,
            key=lambda attempt: (attempt.quality_score, attempt.confidence or 0.0),
        )

        if not best.has_alnum:
            return OcrTranscriptionResult(
                status="NO_TEXT",
                text="",
                confidence=best.confidence,
                strategy_used=best.strategy,
                preprocessing_used=best.preprocessing,
            )

        if self._passes_done_threshold(best):
            return OcrTranscriptionResult(
                status="DONE",
                text=best.text,
                confidence=best.confidence,
                strategy_used=best.strategy,
                preprocessing_used=best.preprocessing,
            )

        if self._is_obvious_noise(best):
            return OcrTranscriptionResult(
                status="NO_TEXT",
                text="",
                confidence=best.confidence,
                strategy_used=best.strategy,
                preprocessing_used=best.preprocessing,
            )

        return OcrTranscriptionResult(
            status="LOW_CONFIDENCE",
            text=best.text,
            confidence=best.confidence,
            strategy_used=best.strategy,
            preprocessing_used=best.preprocessing,
        )

    @staticmethod
    def _build_strategies() -> list[OcrAttemptStrategy]:
        return [
            OcrAttemptStrategy(
                name="psm6_block",
                psm=6,
                extra_config="-c preserve_interword_spaces=1",
            ),
            OcrAttemptStrategy(name="psm7_line", psm=7),
            OcrAttemptStrategy(name="psm8_word", psm=8),
            OcrAttemptStrategy(name="psm11_sparse", psm=11),
            OcrAttemptStrategy(name="psm13_raw", psm=13),
        ]

    def _build_attempt_plan(
        self,
        variants: list[OcrImageVariant],
        strategies: list[OcrAttemptStrategy],
        has_dark_background_hint: bool,
    ) -> list[tuple[OcrImageVariant, OcrAttemptStrategy]]:
        by_name = {variant.name: variant for variant in variants}
        strategy_by_name = {strategy.name: strategy for strategy in strategies}
        default_variant = (
            by_name.get("grayscale_x2")
            or by_name.get("grayscale")
            or by_name.get("original")
            or variants[0]
        )
        plan: list[tuple[OcrImageVariant, OcrAttemptStrategy]] = []
        seen: set[tuple[str, str]] = set()

        def append_pair(variant_name: str, strategy_name: str) -> None:
            variant = by_name.get(variant_name)
            strategy = strategy_by_name.get(strategy_name)
            if variant is None or strategy is None:
                return
            key = (variant.name, strategy.name)
            if key in seen:
                return
            seen.add(key)
            plan.append((variant, strategy))

        # Always test all requested PSM modes at least once.
        for strategy in strategies:
            key = (default_variant.name, strategy.name)
            if key not in seen:
                seen.add(key)
                plan.append((default_variant, strategy))

        recommended_pairs = {
            "original": ["psm6_block", "psm11_sparse"],
            "grayscale": ["psm6_block", "psm11_sparse"],
            "grayscale_x2": ["psm6_block", "psm7_line", "psm11_sparse"],
            "grayscale_x3": ["psm7_line", "psm8_word", "psm13_raw"],
            "threshold": ["psm6_block", "psm7_line"],
            "threshold_x2": ["psm6_block", "psm7_line", "psm8_word", "psm13_raw"],
            "sharpen": ["psm6_block", "psm7_line"],
            "sharpen_x2": ["psm6_block", "psm7_line", "psm8_word"],
        }
        if has_dark_background_hint:
            recommended_pairs.update(
                {
                    "inverted": ["psm6_block", "psm11_sparse"],
                    "inverted_x2": ["psm6_block", "psm7_line", "psm11_sparse"],
                    "inverted_threshold": ["psm6_block", "psm7_line"],
                    "inverted_threshold_x2": [
                        "psm6_block",
                        "psm7_line",
                        "psm8_word",
                        "psm13_raw",
                    ],
                }
            )

        for variant_name, strategy_names in recommended_pairs.items():
            for strategy_name in strategy_names:
                append_pair(variant_name, strategy_name)

        max_attempts = 28
        return plan[:max_attempts]

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        words = data.get("text", []) or []
        if not words:
            return ""

        blocks = data.get("block_num", []) or []
        paragraphs = data.get("par_num", []) or []
        lines = data.get("line_num", []) or []
        assembled_lines: list[str] = []
        current_tokens: list[str] = []
        current_key: tuple[int, int, int] | None = None

        for index, raw_token in enumerate(words):
            token = str(raw_token).strip()
            if not token:
                continue
            key = (
                int(blocks[index]) if index < len(blocks) else 0,
                int(paragraphs[index]) if index < len(paragraphs) else 0,
                int(lines[index]) if index < len(lines) else 0,
            )
            if current_key is None:
                current_key = key
            if key != current_key:
                if current_tokens:
                    assembled_lines.append(" ".join(current_tokens))
                current_tokens = [token]
                current_key = key
            else:
                current_tokens.append(token)

        if current_tokens:
            assembled_lines.append(" ".join(current_tokens))
        return "\n".join(assembled_lines).strip()

    @staticmethod
    def _normalize_text(text: str) -> str:
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
        non_empty = [line for line in lines if line]
        return "\n".join(non_empty).strip()

    @staticmethod
    def _text_metrics(text: str) -> dict[str, float | int | bool]:
        compact_text = re.sub(r"\s+", "", text)
        compact_length = len(compact_text)
        allowed_symbols = set("._-/:+%#[]()")
        valid_chars = sum(
            1 for char in compact_text if char.isalnum() or char in allowed_symbols
        )
        symbol_chars = sum(
            1 for char in compact_text if not (char.isalnum() or char in allowed_symbols)
        )
        valid_char_ratio = valid_chars / compact_length if compact_length else 0.0
        symbol_ratio = symbol_chars / compact_length if compact_length else 0.0
        tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9._:/+\-]*", text)
        token_count = len(tokens)
        single_char_tokens = sum(
            1
            for token in tokens
            if len(re.sub(r"[^A-Za-z0-9]", "", token)) <= 1
        )
        single_char_ratio = single_char_tokens / token_count if token_count > 0 else 1.0
        has_alnum = bool(re.search(r"[A-Za-z0-9]", text))

        return {
            "compact_length": compact_length,
            "valid_char_ratio": valid_char_ratio,
            "symbol_ratio": symbol_ratio,
            "token_count": token_count,
            "single_char_ratio": single_char_ratio,
            "has_alnum": has_alnum,
        }

    @staticmethod
    def _score_candidate(
        confidence: float | None,
        valid_char_ratio: float,
        symbol_ratio: float,
        compact_length: int,
        token_count: int,
        single_char_ratio: float,
    ) -> float:
        confidence_score = confidence if confidence is not None else 0.0
        length_score = min(compact_length, 48) / 48
        token_score = min(token_count, 6) / 6
        score = (
            (0.5 * confidence_score)
            + (0.25 * valid_char_ratio)
            + (0.15 * length_score)
            + (0.1 * token_score)
        )
        if symbol_ratio > 0.55:
            score -= 0.2
        if single_char_ratio > 0.8 and token_count >= 3:
            score -= 0.1
        if compact_length < 3:
            score -= 0.08
        return round(score, 5)

    @staticmethod
    def _passes_done_threshold(attempt: OcrAttemptResult) -> bool:
        confidence = attempt.confidence or 0.0
        if attempt.compact_length >= 8:
            return (
                confidence >= 0.36
                and attempt.quality_score >= 0.43
                and attempt.valid_char_ratio >= 0.58
                and attempt.symbol_ratio <= 0.45
            )
        if attempt.compact_length >= 4:
            return (
                confidence >= 0.45
                and attempt.quality_score >= 0.47
                and attempt.valid_char_ratio >= 0.62
                and attempt.symbol_ratio <= 0.4
            )
        return (
            confidence >= 0.6
            and attempt.quality_score >= 0.55
            and attempt.valid_char_ratio >= 0.75
            and attempt.symbol_ratio <= 0.25
        )

    @staticmethod
    def _is_obvious_noise(attempt: OcrAttemptResult) -> bool:
        if attempt.compact_length <= 1:
            return True
        if attempt.symbol_ratio > 0.65:
            return True
        if attempt.valid_char_ratio < 0.3 and (attempt.confidence or 0.0) < 0.45:
            return True
        return False

    @staticmethod
    def _calculate_confidence(conf_values: list[Any]) -> float | None:
        numeric: list[float] = []
        for value in conf_values:
            try:
                parsed = float(value)
            except (ValueError, TypeError):
                continue
            if parsed >= 0:
                numeric.append(parsed)
        if not numeric:
            return None
        return round((sum(numeric) / len(numeric)) / 100, 4)

    @staticmethod
    def _discover_windows_tesseract() -> str | None:
        candidates = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for candidate in candidates:
            if Path(candidate).exists():
                return candidate
        return None


