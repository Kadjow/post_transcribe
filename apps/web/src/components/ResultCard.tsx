import { useEffect, useMemo, useState } from "react";
import type { DocumentImage } from "../types/api";
import { toApiAssetUrl } from "../services/apiClient";
import { formatConfidence } from "../utils/format";
import { StatusBadge } from "./StatusBadge";

interface ResultCardProps {
  image: DocumentImage;
}

function statusTone(
  status: DocumentImage["ocr"]["status"]
): "neutral" | "success" | "warning" | "danger" {
  if (status === "DONE") {
    return "success";
  }
  if (status === "LOW_CONFIDENCE" || status === "NO_TEXT" || status === "PENDING") {
    return "warning";
  }
  if (status === "ERROR") {
    return "danger";
  }
  return "neutral";
}

export function ResultCard({ image }: ResultCardProps): JSX.Element {
  const thumbnailSrc = useMemo(
    () => toApiAssetUrl(image.thumbnailUrl || image.imageUrl),
    [image.thumbnailUrl, image.imageUrl]
  );
  const originalSrc = useMemo(() => toApiAssetUrl(image.imageUrl), [image.imageUrl]);
  const [src, setSrc] = useState(thumbnailSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(thumbnailSrc);
    setFailed(false);
  }, [thumbnailSrc]);

  const handleImageError = () => {
    if (src !== originalSrc && originalSrc) {
      if (import.meta.env.DEV) {
        console.warn(
          `[ResultCard] Thumbnail failed for ${image.id}. Fallback to imageUrl.`,
          src
        );
      }
      setSrc(originalSrc);
      return;
    }
    if (import.meta.env.DEV) {
      console.warn(`[ResultCard] Image failed for ${image.id}.`, src);
    }
    setFailed(true);
  };
  const showDebugMetadata = import.meta.env.DEV;

  return (
    <article className="card stack tight">
      <div className="row between">
        <strong>{image.id}</strong>
        <span className="muted">Page {image.page}</span>
      </div>
      {!failed ? (
        <img
          className="result-image"
          src={src}
          alt={`Preview ${image.id}`}
          onError={handleImageError}
        />
      ) : (
        <div className="image-fallback result-fallback">
          <strong>Preview unavailable</strong>
          <span className="muted">{image.id}</span>
        </div>
      )}
      <div className="row gap-sm">
        <StatusBadge label={image.ocr.status} tone={statusTone(image.ocr.status)} />
        <span className="muted">Confidence: {formatConfidence(image.ocr.confidence)}</span>
      </div>
      {image.ocr.status === "DONE" ? <pre className="ocr-text">{image.ocr.text}</pre> : null}
      {image.ocr.status === "LOW_CONFIDENCE" ? (
        <>
          <p className="muted">Text detected, but confidence/quality is below threshold.</p>
          {image.ocr.text ? <pre className="ocr-text">{image.ocr.text}</pre> : null}
        </>
      ) : null}
      {image.ocr.status === "NO_TEXT" ? <p className="muted">No detectable text.</p> : null}
      {image.ocr.status === "ERROR" ? (
        <p className="error">{image.ocr.error ?? "OCR failed."}</p>
      ) : null}
      {image.ocr.status === "NOT_REQUESTED" ? (
        <p className="muted">Transcription was not requested.</p>
      ) : null}
      {image.ocr.status === "PENDING" ? (
        <p className="muted">Transcription in progress.</p>
      ) : null}
      {showDebugMetadata ? (
        <p className="muted">
          Strategy: {image.ocr.strategyUsed ?? "n/a"} | Preprocess:{" "}
          {image.ocr.preprocessingUsed ?? "n/a"}
        </p>
      ) : null}
    </article>
  );
}
