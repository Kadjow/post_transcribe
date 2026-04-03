import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { DocumentImage, TranscriptionMode } from "../types/api";
import { ActionBar } from "../components/ActionBar";
import { DocumentProgressPanel } from "../components/DocumentProgressPanel";
import { ErrorState } from "../components/ErrorState";
import { ImageLightbox } from "../components/ImageLightbox";
import { ImageThumbnailList } from "../components/ImageThumbnailList";
import { StatusBadge } from "../components/StatusBadge";
import { useAnalyzePolling } from "../hooks/useAnalyzePolling";
import { useImageSelection } from "../hooks/useImageSelection";
import { toApiAssetUrl } from "../services/apiClient";
import { startTranscription } from "../services/pdfService";
import { getErrorGuidance } from "../utils/errorGuidance";

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
  const { data, processing, isLoading, error, retry } = useAnalyzePolling(documentId);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastSubmissionRef = useRef<{ mode: TranscriptionMode; selectedIds: string[] } | null>(null);

  const images = useMemo(() => data?.pages.flatMap((page) => page.images) ?? [], [data?.pages]);
  const imageIds = useMemo(() => images.map((image) => image.id), [images]);
  const selection = useImageSelection(imageIds);
  const imageMap = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const selectedImages = useMemo(
    () =>
      selection.selectedIds
        .map((id) => imageMap.get(id))
        .filter((image): image is DocumentImage => Boolean(image)),
    [selection.selectedIds, imageMap]
  );

  const activeIndex = useMemo(
    () => images.findIndex((image) => image.id === activeImageId),
    [images, activeImageId]
  );
  const activeImage: DocumentImage | null = activeIndex >= 0 ? images[activeIndex] : null;
  const activeImageIsSelected = activeImage ? selection.isSelected(activeImage.id) : false;

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
    lastSubmissionRef.current = {
      mode,
      selectedIds: [...selectedIds]
    };
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
        requestError instanceof Error ? requestError.message : "Falha ao iniciar a transcricao."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryLastSubmission = () => {
    const lastSubmission = lastSubmissionRef.current;
    if (!lastSubmission) {
      setSubmissionError(null);
      return;
    }
    void submitTranscription(lastSubmission.mode, lastSubmission.selectedIds);
  };

  if (!documentId) {
    const guidance = getErrorGuidance("invalid_document");
    return (
      <ErrorState
        title={guidance.title}
        description={guidance.description}
        nextStep={guidance.nextStep}
        actions={[
          { label: "Voltar ao inicio", onClick: () => navigate("/") },
          { label: "Recarregar pagina", onClick: () => window.location.reload(), tone: "secondary" }
        ]}
      />
    );
  }

  if (processing?.stage === "failed") {
    const guidance = getErrorGuidance("analysis", processing.errorMessage ?? error);
    return (
      <ErrorState
        title={guidance.title}
        description={guidance.description}
        nextStep={guidance.nextStep}
        actions={[
          { label: "Tentar novamente", onClick: retry },
          { label: "Recarregar pagina", onClick: () => window.location.reload() },
          { label: "Enviar outro arquivo", onClick: () => navigate("/"), tone: "secondary" }
        ]}
      />
    );
  }

  if (error && !data && !processing) {
    const guidance = getErrorGuidance("analysis", error);
    return (
      <ErrorState
        title={guidance.title}
        description={guidance.description}
        nextStep={guidance.nextStep}
        actions={[
          { label: "Tentar novamente", onClick: retry },
          { label: "Recarregar pagina", onClick: () => window.location.reload() },
          { label: "Voltar ao inicio", onClick: () => navigate("/"), tone: "secondary" }
        ]}
      />
    );
  }

  if (isLoading && !data && !processing) {
    return <p className="card">Carregando status do documento...</p>;
  }

  return (
    <section className="stack review-page">
      {error ? (
        <ErrorState
          title={getErrorGuidance("analysis", error).title}
          description={getErrorGuidance("analysis", error).description}
          nextStep={getErrorGuidance("analysis", error).nextStep}
          compact
          actions={[
            { label: "Tentar novamente", onClick: retry },
            { label: "Recarregar pagina", onClick: () => window.location.reload(), tone: "secondary" }
          ]}
        />
      ) : null}

      <section className="card stack review-context">
        <div className="row between review-context-header">
          <div className="stack tight">
            <p className="app-header-eyebrow">Review page</p>
            <h2>Revisao de selecao do documento</h2>
            <p className="muted">
              Organize a fila de imagens para transcricao e revise o conteudo com mais fluidez.
            </p>
          </div>
          <StatusBadge
            label={images.length > 0 ? `${images.length} imagens carregadas` : "Sem imagens ainda"}
            tone={images.length > 0 ? "success" : "neutral"}
          />
        </div>
        <div className="summary-grid review-context-grid">
          <div className="summary-item">
            <span className="muted">Documento</span>
            <strong>{documentId}</strong>
          </div>
          <div className="summary-item">
            <span className="muted">Fila selecionada</span>
            <strong>{selection.selectedCount}</strong>
          </div>
          <div className="summary-item">
            <span className="muted">Imagem em foco</span>
            <strong>{activeImage?.id ?? "Aguardando"}</strong>
          </div>
        </div>
      </section>

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

      {submissionError ? (
        <ErrorState
          title={getErrorGuidance("transcription", submissionError).title}
          description={getErrorGuidance("transcription", submissionError).description}
          nextStep={getErrorGuidance("transcription", submissionError).nextStep}
          compact
          actions={[
            { label: "Tentar novamente", onClick: retryLastSubmission },
            { label: "Recarregar pagina", onClick: () => window.location.reload(), tone: "secondary" }
          ]}
        />
      ) : null}

      <section className="review-workspace">
        <section className="stack review-workspace-main">
          <section className="card stack selected-queue">
            <div className="row between selected-queue-header">
              <div className="stack tight">
                <h3>Imagens selecionadas</h3>
                <p className="muted">
                  Revise a fila antes de iniciar. Acoes globais ficam concentradas no bloco superior.
                </p>
              </div>
              <span
                className={`badge ${
                  selectedImages.length > 0 ? "badge-success" : "badge-neutral"
                } selected-queue-count`}
              >
                {selectedImages.length} na fila
              </span>
            </div>

            {selectedImages.length > 0 ? (
              <div className="selected-queue-grid">
                {selectedImages.map((image) => (
                  <article
                    key={image.id}
                    className={`selected-queue-card${image.id === activeImageId ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="selected-queue-preview"
                      onClick={() => setActiveImageId(image.id)}
                    >
                      <img
                        src={toApiAssetUrl(image.thumbnailUrl || image.imageUrl)}
                        alt={`Miniatura ${image.id}`}
                        loading="lazy"
                      />
                      <div className="selected-queue-meta stack tight">
                        <div className="row between">
                          <strong>{image.id}</strong>
                          <span className="muted">Pg {image.page}</span>
                        </div>
                        <p className="muted">Pronta para transcricao</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="danger-button selected-queue-remove"
                      onClick={() => selection.toggle(image.id)}
                      disabled={isSubmitting}
                    >
                      Remover da fila
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted selected-queue-empty">
                Nenhuma imagem na fila. Use a lista "Todas as imagens" para montar sua selecao.
              </p>
            )}
          </section>

          <ImageThumbnailList
            images={images}
            activeImageId={activeImageId}
            selectedIds={selection.selectedIds}
            onSelectImage={setActiveImageId}
            onToggleSelection={selection.toggle}
            showSelection
            title="Todas as imagens"
            subtitle="Selecione as imagens para a fila e abra o detalhe da imagem que deseja revisar."
            sticky={false}
          />
        </section>

        <section className="card detail-pane stack review-detail-pane">
          {activeImage ? (
            <>
              <div className="row between">
                <div className="stack tight">
                  <h3>Painel da imagem selecionada</h3>
                  <p className="muted">
                    {activeImage.id} | Pagina {activeImage.page}
                  </p>
                </div>
                <StatusBadge
                  label={activeImageIsSelected ? "Na fila de transcricao" : "Fora da fila"}
                  tone={activeImageIsSelected ? "success" : "neutral"}
                />
              </div>

              <div className="detail-actions stack tight">
                <div className="row gap-sm wrap">
                  <button
                    type="button"
                    className={activeImageIsSelected ? "danger-button" : "secondary-button"}
                    onClick={() => selection.toggle(activeImage.id)}
                    disabled={isSubmitting}
                  >
                    {activeImageIsSelected ? "Remover da fila" : "Adicionar a fila"}
                  </button>
                </div>
                <div className="row gap-sm wrap">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setActiveImageId(images[Math.max(activeIndex - 1, 0)]?.id ?? null)}
                    disabled={activeIndex <= 0}
                  >
                    Imagem anterior
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setActiveImageId(
                        images[Math.min(activeIndex + 1, Math.max(images.length - 1, 0))]?.id ?? null
                      )
                    }
                    disabled={activeIndex < 0 || activeIndex >= images.length - 1}
                  >
                    Proxima imagem
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsExpanded(true)}
                  >
                    Expandir imagem
                  </button>
                </div>
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
                  <span className="muted">Transcricao</span>
                  <strong>Aguardando transcricao</strong>
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
