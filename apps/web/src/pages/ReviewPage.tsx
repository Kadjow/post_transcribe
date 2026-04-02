import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { DocumentImage, TranscriptionMode } from "../types/api";
import { ActionBar } from "../components/ActionBar";
import { DocumentProgressPanel } from "../components/DocumentProgressPanel";
import { ImageLightbox } from "../components/ImageLightbox";
import { ImageThumbnailList } from "../components/ImageThumbnailList";
import { StatusBadge } from "../components/StatusBadge";
import { useAnalyzePolling } from "../hooks/useAnalyzePolling";
import { useImageSelection } from "../hooks/useImageSelection";
import { toApiAssetUrl } from "../services/apiClient";
import { startTranscription } from "../services/pdfService";

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

export function ReviewPage(): JSX.Element {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { data, processing, isLoading, error } = useAnalyzePolling(documentId);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const images = useMemo(() => data?.pages.flatMap((page) => page.images) ?? [], [data?.pages]);
  const imageIds = useMemo(() => images.map((image) => image.id), [images]);
  const selection = useImageSelection(imageIds);

  const activeIndex = useMemo(
    () => images.findIndex((image) => image.id === activeImageId),
    [images, activeImageId]
  );
  const activeImage: DocumentImage | null = activeIndex >= 0 ? images[activeIndex] : null;

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

  const submitTranscription = async (mode: TranscriptionMode, selectedIds: string[]) => {
    if (!documentId) {
      return;
    }
    try {
      setSubmissionError(null);
      setIsSubmitting(true);
      await startTranscription({
        documentId,
        mode,
        imageIds: selectedIds,
        ocrLanguages: "por+eng"
      });
      navigate(`/results/${documentId}`);
    } catch (requestError) {
      setSubmissionError(
        requestError instanceof Error ? requestError.message : "Falha ao iniciar transcricao."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!documentId) {
    return <p className="error">Document ID invalido.</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (isLoading && !data && !processing) {
    return <p className="card">Carregando status do documento...</p>;
  }

  return (
    <section className="stack">
      <DocumentProgressPanel documentId={documentId} processing={processing} result={data} />

      <ActionBar
        totalImages={images.length}
        selectedCount={selection.selectedCount}
        isSubmitting={isSubmitting}
        onSelectAll={selection.selectAll}
        onClearSelection={selection.clear}
        onTranscribeAll={() => submitTranscription("ALL", [])}
        onTranscribeNone={() => submitTranscription("NONE", [])}
        onTranscribeSelected={() =>
          selection.selectedCount
            ? submitTranscription("SELECTED", selection.selectedIds)
            : Promise.resolve()
        }
      />

      {submissionError ? <p className="error">{submissionError}</p> : null}

      <section className="master-detail-layout">
        <ImageThumbnailList
          images={images}
          activeImageId={activeImageId}
          selectedIds={selection.selectedIds}
          onSelectImage={setActiveImageId}
          onToggleSelection={selection.toggle}
          showSelection
        />

        <section className="card detail-pane stack">
          {activeImage ? (
            <>
              <div className="row between">
                <div className="stack tight">
                  <h3>Imagem selecionada</h3>
                  <p className="muted">
                    {activeImage.id} | Pagina {activeImage.page}
                  </p>
                </div>
                <StatusBadge
                  label={selection.isSelected(activeImage.id) ? "Selecionada para OCR" : "Nao selecionada"}
                  tone={selection.isSelected(activeImage.id) ? "success" : "neutral"}
                />
              </div>

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
              <p className="muted keyboard-tip">
                Dica: use as setas esquerda/direita para navegar entre as imagens.
              </p>

              <img
                className="detail-image"
                src={toApiAssetUrl(activeImage.imageUrl)}
                alt={`Imagem ${activeImage.id}`}
              />

              <div className="detail-meta-grid">
                <div className="summary-item">
                  <span className="muted">ID</span>
                  <strong>{activeImage.id}</strong>
                </div>
                <div className="summary-item">
                  <span className="muted">Pagina</span>
                  <strong>{activeImage.page}</strong>
                </div>
                <div className="summary-item">
                  <span className="muted">Resolucao</span>
                  <strong>
                    {activeImage.width} x {activeImage.height}
                  </strong>
                </div>
                <div className="summary-item">
                  <span className="muted">OCR</span>
                  <strong>Aguardando execucao</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="muted">
              Aguarde o processamento inicial. Quando as imagens forem extraidas, selecione uma para
              visualizar aqui.
            </p>
          )}
        </section>
      </section>

      <ImageLightbox image={activeImage} isOpen={isExpanded} onClose={() => setIsExpanded(false)} />
    </section>
  );
}
