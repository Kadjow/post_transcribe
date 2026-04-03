import { useEffect, useMemo, useState } from "react";
import type { DocumentImage } from "../types/api";
import { toApiAssetUrl } from "../services/apiClient";
import { formatConfidence } from "../utils/format";
import { StatusBadge } from "./StatusBadge";

interface ResultCardProps {
  image: DocumentImage;
}

function statusLabel(status: DocumentImage["ocr"]["status"]): string {
  if (status === "NOT_REQUESTED") {
    return "Transcricao nao iniciada";
  }
  if (status === "PENDING") {
    return "Pendente";
  }
  if (status === "PROCESSING") {
    return "Processando";
  }
  if (status === "DONE") {
    return "Concluida";
  }
  if (status === "LOW_CONFIDENCE") {
    return "Concluida (baixa confianca)";
  }
  if (status === "NO_TEXT") {
    return "Concluida (sem texto)";
  }
  if (status === "CANCELLED") {
    return "Cancelada";
  }
  if (status === "ERROR") {
    return "Erro";
  }
  return status;
}

function statusTone(
  status: DocumentImage["ocr"]["status"]
): "neutral" | "success" | "warning" | "danger" {
  if (status === "DONE") {
    return "success";
  }
  if (
    status === "LOW_CONFIDENCE" ||
    status === "NO_TEXT" ||
    status === "PENDING" ||
    status === "PROCESSING" ||
    status === "CANCELLED"
  ) {
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
          `[ResultCard] Falha na miniatura de ${image.id}. Usando imageUrl como fallback.`,
          src
        );
      }
      setSrc(originalSrc);
      return;
    }
    if (import.meta.env.DEV) {
      console.warn(`[ResultCard] Falha ao carregar imagem ${image.id}.`, src);
    }
    setFailed(true);
  };
  const showDebugMetadata = import.meta.env.DEV;

  return (
    <article className="card stack tight">
      <div className="row between">
        <strong>{image.id}</strong>
        <span className="muted">Pagina {image.page}</span>
      </div>
      {!failed ? (
        <img
          className="result-image"
          src={src}
          alt={`Miniatura ${image.id}`}
          onError={handleImageError}
        />
      ) : (
        <div className="image-fallback result-fallback">
          <strong>Miniatura indisponivel</strong>
          <span className="muted">{image.id}</span>
        </div>
      )}
      <div className="row gap-sm">
        <StatusBadge label={statusLabel(image.ocr.status)} tone={statusTone(image.ocr.status)} />
        <span className="muted">Confianca: {formatConfidence(image.ocr.confidence)}</span>
      </div>
      {image.ocr.status === "DONE" ? <pre className="ocr-text">{image.ocr.text}</pre> : null}
      {image.ocr.status === "LOW_CONFIDENCE" ? (
        <>
          <p className="muted">Texto detectado, mas a confianca/qualidade ficou abaixo do limite.</p>
          {image.ocr.text ? <pre className="ocr-text">{image.ocr.text}</pre> : null}
        </>
      ) : null}
      {image.ocr.status === "NO_TEXT" ? <p className="muted">Nenhum texto detectavel.</p> : null}
      {image.ocr.status === "ERROR" ? (
        <p className="error">{image.ocr.error ?? "Falha na transcricao."}</p>
      ) : null}
      {image.ocr.status === "NOT_REQUESTED" ? (
        <p className="muted">A transcricao nao foi iniciada para esta imagem.</p>
      ) : null}
      {image.ocr.status === "PENDING" || image.ocr.status === "PROCESSING" ? (
        <p className="muted">Transcricao em andamento.</p>
      ) : null}
      {image.ocr.status === "CANCELLED" ? (
        <p className="muted">Transcricao cancelada para esta imagem.</p>
      ) : null}
      {showDebugMetadata ? (
        <p className="muted">
          Estrategia: {image.ocr.strategyUsed ?? "n/d"} | Preprocessamento:{" "}
          {image.ocr.preprocessingUsed ?? "n/d"}
        </p>
      ) : null}
    </article>
  );
}
