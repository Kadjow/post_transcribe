import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DocumentProgressPanel } from "../components/DocumentProgressPanel";
import { ImageLightbox } from "../components/ImageLightbox";
import { ImageThumbnailList } from "../components/ImageThumbnailList";
import { StatusBadge } from "../components/StatusBadge";
import { useTranscriptionPolling } from "../hooks/useTranscriptionPolling";
import { toApiAssetUrl } from "../services/apiClient";
import type { DocumentImage } from "../types/api";
import { formatConfidence } from "../utils/format";
import { ocrTone } from "../utils/processing";

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function ResultsPage(): JSX.Element {
  const { documentId } = useParams();
  const { data, processing, isLoading, error } = useTranscriptionPolling(documentId);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const images = useMemo(() => data?.pages.flatMap((page) => page.images) ?? [], [data?.pages]);
  const activeIndex = useMemo(
    () => images.findIndex((image) => image.id === activeImageId),
    [images, activeImageId]
  );
  const activeImage: DocumentImage | null = activeIndex >= 0 ? images[activeIndex] : null;
  const structuredBlocks = useMemo(
    () => activeImage?.ocr.layoutBlocks ?? [],
    [activeImage?.ocr.layoutBlocks]
  );
  const copyableText = useMemo(() => {
    if (!activeImage) {
      return "";
    }
    if (structuredBlocks.length > 0) {
      return structuredBlocks
        .filter((block) => block.type === "text" && Boolean(block.text?.trim()))
        .map((block) => block.text?.trim() ?? "")
        .join("\n\n")
        .trim();
    }
    return (activeImage.ocr.text ?? "").trim();
  }, [activeImage, structuredBlocks]);

  useEffect(() => {
    if (images.length === 0) {
      setActiveImageId(null);
      return;
    }
    if (!activeImageId || !images.some((image) => image.id === activeImageId)) {
      setActiveImageId(images[0].id);
    }
  }, [images, activeImageId]);

  useEffect(() => {
    setCopyMessage(null);
  }, [activeImageId]);

  useEffect(() => {
    if (images.length === 0 || isExpanded) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFormTarget(event.target)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveImageId(images[Math.max(activeIndex - 1, 0)]?.id ?? null);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveImageId(
          images[Math.min(activeIndex + 1, Math.max(images.length - 1, 0))]?.id ?? null
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images, activeIndex, isExpanded]);

  if (!documentId) {
    return <p className="error">Document ID invalido.</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (isLoading && !data && !processing) {
    return <p className="card">Carregando resultados...</p>;
  }

  const handleCopy = async () => {
    if (!copyableText) {
      setCopyMessage("Nao ha transcricao para copiar nesta imagem.");
      return;
    }
    try {
      await navigator.clipboard.writeText(copyableText);
      setCopyMessage("Transcricao copiada.");
    } catch {
      setCopyMessage("Nao foi possivel copiar a transcricao.");
    }
  };

  return (
    <section className="stack">
      <DocumentProgressPanel documentId={documentId} processing={processing} result={data} />

      <section className="master-detail-layout">
        <ImageThumbnailList
          images={images}
          activeImageId={activeImageId}
          onSelectImage={setActiveImageId}
          showOcrStatus
        />

        <section className="card detail-pane stack">
          {activeImage ? (
            <>
              <div className="row between">
                <div className="stack tight">
                  <h3>Imagem e leitura</h3>
                  <p className="muted">
                    {activeImage.id} | Pagina {activeImage.page}
                  </p>
                </div>
                <StatusBadge label={activeImage.ocr.status} tone={ocrTone(activeImage.ocr.status)} />
              </div>
              <p className="muted keyboard-tip">
                Dica: use as setas esquerda/direita para navegar entre as imagens.
              </p>

              <div className="detail-actions row gap-sm">
                <button
                  type="button"
                  onClick={() => setActiveImageId(images[Math.max(activeIndex - 1, 0)]?.id ?? null)}
                  disabled={activeIndex <= 0}
                >
                  Imagem anterior
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveImageId(
                      images[Math.min(activeIndex + 1, Math.max(images.length - 1, 0))]?.id ?? null
                    )
                  }
                  disabled={activeIndex < 0 || activeIndex >= images.length - 1}
                >
                  Proxima imagem
                </button>
                <button type="button" onClick={() => setIsExpanded(true)}>
                  Expandir imagem
                </button>
              </div>

              <img
                className="detail-image detail-image-primary"
                src={toApiAssetUrl(activeImage.imageUrl)}
                alt={`Imagem ${activeImage.id}`}
              />

              <section className="transcription-result stack tight">
                <div className="row between">
                  <h4>Resultado da leitura</h4>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleCopy}
                    disabled={!activeImage.ocr.text?.trim()}
                  >
                    Copiar transcricao
                  </button>
                </div>
                {activeImage.ocr.status === "ERROR" ? (
                  <p className="error">
                    {activeImage.ocr.error ?? "Falha ao processar esta imagem."}
                  </p>
                ) : null}
                {activeImage.ocr.status === "NO_TEXT" ? (
                  <p className="muted">
                    Nao foi detectado texto nesta imagem. Tente outra imagem ou revise a qualidade.
                  </p>
                ) : null}
                {activeImage.ocr.status === "PENDING" ? (
                  <p className="muted">OCR em andamento para esta imagem.</p>
                ) : null}
                {activeImage.ocr.status === "NOT_REQUESTED" ? (
                  <p className="muted">Esta imagem nao foi selecionada para OCR.</p>
                ) : null}
                {structuredBlocks.length > 0 ? (
                  <section className="layout-blocks stack tight">
                    {structuredBlocks.map((block, index) =>
                      block.type === "image" ? (
                        <div
                          key={`${activeImage.id}-image-${index}`}
                          className="layout-image-marker"
                        >
                          [Imagem detectada]
                        </div>
                      ) : (
                        <pre
                          key={`${activeImage.id}-text-${index}`}
                          className="ocr-text readable-text layout-text-block"
                        >
                          {block.text ?? ""}
                        </pre>
                      )
                    )}
                  </section>
                ) : activeImage.ocr.text ? (
                  <pre className="ocr-text detail-text readable-text">{activeImage.ocr.text}</pre>
                ) : (
                  <p className="muted">
                    Nenhuma transcricao disponivel para esta imagem ate o momento.
                  </p>
                )}
                {structuredBlocks.length > 0 && activeImage.ocr.text ? (
                  <details className="technical-details">
                    <summary>Mostrar transcricao corrida</summary>
                    <pre className="ocr-text readable-text">{activeImage.ocr.text}</pre>
                  </details>
                ) : null}
                <p className="confidence-line">
                  Confianca da leitura: <strong>{formatConfidence(activeImage.ocr.confidence)}</strong>
                </p>
                {copyMessage ? <p className="muted">{copyMessage}</p> : null}
              </section>

              <section className="summary-grid result-status-grid">
                <div className="summary-item">
                  <span className="muted">Status OCR</span>
                  <strong>{activeImage.ocr.status}</strong>
                </div>
                <div className="summary-item">
                  <span className="muted">Confianca</span>
                  <strong>{formatConfidence(activeImage.ocr.confidence)}</strong>
                </div>
                <div className="summary-item">
                  <span className="muted">Resolucao</span>
                  <strong>
                    {activeImage.width} x {activeImage.height}
                  </strong>
                </div>
              </section>

              <details className="technical-details">
                <summary>Mostrar detalhes tecnicos</summary>
                <div className="detail-meta-grid">
                  <div className="summary-item">
                    <span className="muted">Strategy</span>
                    <strong>{activeImage.ocr.strategyUsed ?? "n/a"}</strong>
                  </div>
                  <div className="summary-item">
                    <span className="muted">Preprocess</span>
                    <strong>{activeImage.ocr.preprocessingUsed ?? "n/a"}</strong>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <p className="muted">
              Nenhuma imagem disponivel ainda. Aguarde o processamento ou volte para revisar o
              documento.
            </p>
          )}
        </section>
      </section>

      <ImageLightbox image={activeImage} isOpen={isExpanded} onClose={() => setIsExpanded(false)} />
    </section>
  );
}
