import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DocumentProgressPanel } from "../components/DocumentProgressPanel";
import { ErrorState } from "../components/ErrorState";
import { ImageLightbox } from "../components/ImageLightbox";
import { ImageThumbnailList } from "../components/ImageThumbnailList";
import { StatusBadge } from "../components/StatusBadge";
import { useImageSelection } from "../hooks/useImageSelection";
import { useTranscriptionPolling } from "../hooks/useTranscriptionPolling";
import { toApiAssetUrl } from "../services/apiClient";
import { cancelTranscription } from "../services/pdfService";
import type { DocumentImage } from "../types/api";
import { getErrorGuidance } from "../utils/errorGuidance";
import { formatConfidence } from "../utils/format";
import { ocrTone } from "../utils/processing";

const CANCELLABLE_STATUSES = new Set<DocumentImage["ocr"]["status"]>([
  "PENDING",
  "PROCESSING"
]);
const TRANSCRIBED_STATUSES = new Set<DocumentImage["ocr"]["status"]>([
  "DONE",
  "LOW_CONFIDENCE",
  "NO_TEXT"
]);
const PENDING_STATUSES = new Set<DocumentImage["ocr"]["status"]>(["PENDING", "PROCESSING"]);
const COPY_FEEDBACK_TIMEOUT_MS = 2400;

type CopyFeedbackTone = "success" | "error";
type ImageFilterKey = "all" | "transcribed" | "pending" | "not_started" | "error" | "cancelled";

const IMAGE_FILTER_LABELS: Record<ImageFilterKey, string> = {
  all: "Todas",
  transcribed: "Transcritas",
  pending: "Pendentes",
  not_started: "Nao iniciadas",
  error: "Com erro",
  cancelled: "Canceladas"
};

function imageFilterKeyByStatus(status: DocumentImage["ocr"]["status"]): Exclude<ImageFilterKey, "all"> {
  if (TRANSCRIBED_STATUSES.has(status)) {
    return "transcribed";
  }
  if (PENDING_STATUSES.has(status)) {
    return "pending";
  }
  if (status === "NOT_REQUESTED") {
    return "not_started";
  }
  if (status === "ERROR") {
    return "error";
  }
  return "cancelled";
}

function matchesImageFilter(image: DocumentImage, filter: ImageFilterKey): boolean {
  if (filter === "all") {
    return true;
  }
  return imageFilterKeyByStatus(image.ocr.status) === filter;
}

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

function normalizeLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasStructuredSections(
  image: DocumentImage | null
): image is DocumentImage & {
  ocr: DocumentImage["ocr"] & { structuredContent: NonNullable<DocumentImage["ocr"]["structuredContent"]> };
} {
  if (!image?.ocr.structuredContent) {
    return false;
  }
  return image.ocr.structuredContent.kind !== "simple_text";
}

function buildCopyText(
  image: DocumentImage | null,
  blocks: DocumentImage["ocr"]["layoutBlocks"]
): string {
  if (!image) {
    return "";
  }

  if (hasStructuredSections(image)) {
    const structured = image.ocr.structuredContent;
    const lines: string[] = [];
    const title = normalizeLine(structured.title);
    if (title) {
      lines.push(`TITULO: ${title}`);
    }
    if (structured.mainText.length > 0) {
      lines.push("TEXTO PRINCIPAL:");
      for (const row of structured.mainText) {
        const value = normalizeLine(row);
        if (value) {
          lines.push(`- ${value}`);
        }
      }
    }
    if (structured.figureDetected) {
      lines.push("FIGURA / DIAGRAMA: [imagem detectada]");
    }
    if (structured.figureLabels.length > 0) {
      lines.push("ROTULOS DA FIGURA:");
      for (const row of structured.figureLabels) {
        const value = normalizeLine(row);
        if (value) {
          lines.push(`- ${value}`);
        }
      }
    }
    const footer = normalizeLine(structured.footer);
    if (footer) {
      lines.push(`RODAPE: ${footer}`);
    }
    return lines.join("\n").trim();
  }

  if (blocks.length > 0) {
    return blocks
      .filter((block) => block.type === "text" && Boolean(block.text?.trim()))
      .map((block) => block.text?.trim() ?? "")
      .join("\n\n")
      .trim();
  }

  return normalizeLine(image.ocr.text);
}

function imageStatusLabel(status: DocumentImage["ocr"]["status"]): string {
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

function StructuredContentView({
  image
}: {
  image: DocumentImage & {
    ocr: DocumentImage["ocr"] & { structuredContent: NonNullable<DocumentImage["ocr"]["structuredContent"]> };
  };
}): JSX.Element {
  const structured = image.ocr.structuredContent;
  const showAscii = Boolean(structured.asciiMap?.trim());
  const title = normalizeLine(structured.title);
  const footer = normalizeLine(structured.footer);

  return (
    <section className="structured-content stack tight">
      {title ? (
        <div className="structured-section">
          <h5>TITULO</h5>
          <p>{title}</p>
        </div>
      ) : null}

      <details className="technical-details structured-main-text">
        <summary>Mostrar texto principal</summary>
        {structured.mainText.length > 0 ? (
          <ul className="structured-list">
            {structured.mainText.map((entry, index) => (
              <li key={`${image.id}-main-${index}`}>{entry}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sem texto principal identificado.</p>
        )}
      </details>

      <details className="technical-details">
        <summary>Figura / Diagrama</summary>
        <p className="structured-figure-status">
          {structured.figureDetected ? "[Imagem detectada]" : "Nao identificada"}
        </p>
      </details>

      {structured.figureLabels.length > 0 ? (
        <div className="structured-section">
          <h5>ROTULOS DA FIGURA</h5>
          <ul className="structured-list">
            {structured.figureLabels.map((entry, index) => (
              <li key={`${image.id}-label-${index}`}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {footer ? (
        <div className="structured-section">
          <h5>RODAPE</h5>
          <p>{footer}</p>
        </div>
      ) : null}

      {showAscii ? (
        <details className="technical-details">
          <summary>Mapa estrutural (ASCII)</summary>
          <pre className="ocr-text ascii-map">{structured.asciiMap}</pre>
        </details>
      ) : null}
    </section>
  );
}

export function ResultsPage(): JSX.Element {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { data, processing, isLoading, error, retry } = useTranscriptionPolling(documentId);
  const [activeFilter, setActiveFilter] = useState<ImageFilterKey>("all");
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{ tone: CopyFeedbackTone; message: string } | null>(
    null
  );
  const [isCopying, setIsCopying] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const filterTouchedRef = useRef(false);
  const lastCancelRequestRef = useRef<{ mode: "ALL" | "SELECTED"; imageIds: string[] } | null>(null);

  const images = useMemo(() => data?.pages.flatMap((page) => page.images) ?? [], [data?.pages]);
  const selection = useImageSelection(images.map((image) => image.id));
  const filterCounts = useMemo(() => {
    const counts: Record<ImageFilterKey, number> = {
      all: images.length,
      transcribed: 0,
      pending: 0,
      not_started: 0,
      error: 0,
      cancelled: 0
    };
    for (const image of images) {
      counts[imageFilterKeyByStatus(image.ocr.status)] += 1;
    }
    return counts;
  }, [images]);
  const filteredImages = useMemo(
    () => images.filter((image) => matchesImageFilter(image, activeFilter)),
    [images, activeFilter]
  );
  const filterOptions = useMemo(
    () =>
      (Object.keys(IMAGE_FILTER_LABELS) as ImageFilterKey[]).map((filterKey) => ({
        key: filterKey,
        label: IMAGE_FILTER_LABELS[filterKey],
        count: filterCounts[filterKey]
      })),
    [filterCounts]
  );
  const activeFilterLabel = IMAGE_FILTER_LABELS[activeFilter];
  const emptyFilterLabel =
    activeFilter === "all"
      ? "Nenhuma imagem disponivel neste documento."
      : `Nenhuma imagem em ${activeFilterLabel.toLowerCase()} no momento.`;

  const cancellableImageIds = useMemo(
    () => images.filter((image) => CANCELLABLE_STATUSES.has(image.ocr.status)).map((image) => image.id),
    [images]
  );
  const cancellableSet = useMemo(() => new Set(cancellableImageIds), [cancellableImageIds]);
  const selectedCancellableIds = useMemo(
    () => selection.selectedIds.filter((id) => cancellableSet.has(id)),
    [selection.selectedIds, cancellableSet]
  );

  const activeIndex = useMemo(
    () => filteredImages.findIndex((image) => image.id === activeImageId),
    [filteredImages, activeImageId]
  );
  const activeImage: DocumentImage | null = activeIndex >= 0 ? filteredImages[activeIndex] : null;
  const structuredBlocks = useMemo(
    () => activeImage?.ocr.layoutBlocks ?? [],
    [activeImage?.ocr.layoutBlocks]
  );
  const copyableText = useMemo(
    () => buildCopyText(activeImage, structuredBlocks),
    [activeImage, structuredBlocks]
  );
  const canCancelActive = Boolean(activeImage && CANCELLABLE_STATUSES.has(activeImage.ocr.status));

  useEffect(() => {
    if (images.length === 0) {
      if (!filterTouchedRef.current && activeFilter !== "all") {
        setActiveFilter("all");
      }
      return;
    }
    if (
      !filterTouchedRef.current &&
      activeFilter === "all" &&
      filterCounts.transcribed > 0
    ) {
      setActiveFilter("transcribed");
    }
  }, [images.length, filterCounts.transcribed, activeFilter]);

  useEffect(() => {
    if (filteredImages.length === 0) {
      setActiveImageId(null);
      return;
    }
    if (!activeImageId || !filteredImages.some((image) => image.id === activeImageId)) {
      setActiveImageId(filteredImages[0].id);
    }
  }, [filteredImages, activeImageId]);

  const handleFilterChange = (nextFilter: string) => {
    const candidate = nextFilter as ImageFilterKey;
    if (!(candidate in IMAGE_FILTER_LABELS)) {
      return;
    }
    filterTouchedRef.current = true;
    setActiveFilter(candidate);
  };

  const clearCopyFeedbackTimer = () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
  };

  const showCopyFeedback = (tone: CopyFeedbackTone, message: string) => {
    setCopyFeedback({ tone, message });
    clearCopyFeedbackTimer();
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, COPY_FEEDBACK_TIMEOUT_MS);
  };

  useEffect(() => {
    setCopyFeedback(null);
    setIsCopying(false);
    clearCopyFeedbackTimer();
  }, [activeImageId]);

  useEffect(() => {
    return () => {
      clearCopyFeedbackTimer();
    };
  }, []);

  useEffect(() => {
    if (filteredImages.length === 0 || isExpanded) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFormTarget(event.target)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveImageId(filteredImages[Math.max(activeIndex - 1, 0)]?.id ?? null);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveImageId(
          filteredImages[Math.min(activeIndex + 1, Math.max(filteredImages.length - 1, 0))]?.id ??
            null
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredImages, activeIndex, isExpanded]);

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
    const guidance = getErrorGuidance("transcription", processing.errorMessage ?? error);
    return (
      <ErrorState
        title={guidance.title}
        description={guidance.description}
        nextStep={guidance.nextStep}
        actions={[
          { label: "Tentar carregar novamente os resultados", onClick: retry },
          { label: "Voltar para revisao", onClick: () => navigate(`/review/${documentId}`) },
          { label: "Recarregar pagina", onClick: () => window.location.reload(), tone: "secondary" }
        ]}
      />
    );
  }

  if (error && !data && !processing) {
    const guidance = getErrorGuidance("results", error);
    return (
      <ErrorState
        title={guidance.title}
        description={guidance.description}
        nextStep={guidance.nextStep}
        actions={[
          { label: "Tentar carregar novamente os resultados", onClick: retry },
          { label: "Recarregar pagina", onClick: () => window.location.reload() },
          { label: "Voltar ao inicio", onClick: () => navigate("/"), tone: "secondary" }
        ]}
      />
    );
  }

  if (isLoading && !data && !processing) {
    return <p className="card">Carregando resultados...</p>;
  }

  const handleCopy = async () => {
    if (!copyableText) {
      showCopyFeedback("error", "Nao ha transcricao para copiar nesta imagem.");
      return;
    }
    if (!navigator.clipboard?.writeText) {
      showCopyFeedback("error", "Seu navegador nao permite copiar automaticamente.");
      return;
    }
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(copyableText);
      showCopyFeedback("success", "Texto copiado com sucesso.");
    } catch {
      showCopyFeedback("error", "Nao foi possivel copiar a transcricao. Tente novamente.");
    } finally {
      setIsCopying(false);
    }
  };

  const handleCancel = async (mode: "ALL" | "SELECTED", imageIds: string[]) => {
    if (!documentId) {
      return;
    }
    lastCancelRequestRef.current = {
      mode,
      imageIds: [...imageIds]
    };
    try {
      setCancelError(null);
      setCancelMessage(null);
      setIsCancelling(true);
      const response = await cancelTranscription({
        documentId,
        mode,
        imageIds
      });
      setCancelMessage(response.message);
      if (response.cancelledImageCount > 0) {
        selection.clear();
      }
    } catch (requestError) {
      setCancelError(
        requestError instanceof Error ? requestError.message : "Falha ao cancelar a transcricao."
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const retryLastCancel = () => {
    const lastCancelRequest = lastCancelRequestRef.current;
    if (!lastCancelRequest) {
      setCancelError(null);
      return;
    }
    void handleCancel(lastCancelRequest.mode, lastCancelRequest.imageIds);
  };

  return (
    <section className="stack">
      {error ? (
        <ErrorState
          title={getErrorGuidance("results", error).title}
          description={getErrorGuidance("results", error).description}
          nextStep={getErrorGuidance("results", error).nextStep}
          compact
          actions={[
            { label: "Tentar carregar novamente os resultados", onClick: retry },
            { label: "Recarregar pagina", onClick: () => window.location.reload(), tone: "secondary" }
          ]}
        />
      ) : null}

      <DocumentProgressPanel documentId={documentId} processing={processing} result={data} />

      <section className="card stack">
        <div className="row between">
          <h3>Acoes de cancelamento</h3>
          <span className="muted">
            Selecionadas: {selection.selectedCount} | Elegiveis: {cancellableImageIds.length}
          </span>
        </div>
        <div className="row gap-sm wrap">
          <button
            type="button"
            onClick={selection.selectAll}
            disabled={images.length === 0 || isCancelling}
          >
            Selecionar todas
          </button>
          <button
            type="button"
            onClick={selection.clear}
            disabled={selection.selectedCount === 0 || isCancelling}
          >
            Limpar selecao
          </button>
        </div>
        <div className="row gap-sm wrap">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleCancel("ALL", [])}
            disabled={cancellableImageIds.length === 0 || isCancelling}
          >
            {isCancelling ? "Cancelando..." : "Cancelar todas em andamento"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleCancel("SELECTED", selectedCancellableIds)}
            disabled={selectedCancellableIds.length === 0 || isCancelling}
          >
            Cancelar selecionadas
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              activeImage ? void handleCancel("SELECTED", [activeImage.id]) : undefined
            }
            disabled={!canCancelActive || isCancelling}
          >
            Cancelar imagem atual
          </button>
        </div>
        {cancelMessage ? <p className="muted">{cancelMessage}</p> : null}
        {cancelError ? (
          <ErrorState
            title={getErrorGuidance("transcription", cancelError).title}
            description={getErrorGuidance("transcription", cancelError).description}
            nextStep={getErrorGuidance("transcription", cancelError).nextStep}
            compact
            actions={[
              { label: "Tentar novamente", onClick: retryLastCancel },
              { label: "Recarregar pagina", onClick: () => window.location.reload(), tone: "secondary" }
            ]}
          />
        ) : null}
      </section>

      <section className="master-detail-layout">
        <ImageThumbnailList
          images={filteredImages}
          totalItemsCount={images.length}
          activeImageId={activeImageId}
          selectedIds={selection.selectedIds}
          onSelectImage={setActiveImageId}
          onToggleSelection={selection.toggle}
          filters={filterOptions}
          activeFilterKey={activeFilter}
          onFilterChange={handleFilterChange}
          emptyStateLabel={emptyFilterLabel}
          showSelection
          showOcrStatus
          title="Lista de imagens"
          subtitle="Filtre por status para focar no que ja foi transcrito ou no que ainda exige acao."
        />

        <section className="card detail-pane stack">
          {activeImage ? (
            <>
              <div className="row between">
                <div className="stack tight">
                  <h3>Imagem e transcricao</h3>
                  <p className="muted">
                    {activeImage.id} | Pagina {activeImage.page}
                  </p>
                </div>
                <StatusBadge
                  label={imageStatusLabel(activeImage.ocr.status)}
                  tone={ocrTone(activeImage.ocr.status)}
                />
              </div>
              <p className="muted keyboard-tip">
                Dica: use as setas esquerda/direita para navegar dentro do filtro atual.
              </p>

              <div className="detail-actions row gap-sm">
                <button
                  type="button"
                  onClick={() =>
                    setActiveImageId(filteredImages[Math.max(activeIndex - 1, 0)]?.id ?? null)
                  }
                  disabled={activeIndex <= 0}
                >
                  Imagem anterior
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveImageId(
                      filteredImages[
                        Math.min(activeIndex + 1, Math.max(filteredImages.length - 1, 0))
                      ]?.id ?? null
                    )
                  }
                  disabled={activeIndex < 0 || activeIndex >= filteredImages.length - 1}
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
                  <h4>Resultado da transcricao</h4>
                  <button
                    type="button"
                    className={`secondary-button copy-button ${
                      copyFeedback?.tone === "success"
                        ? "copy-button-success"
                        : copyFeedback?.tone === "error"
                          ? "copy-button-error"
                          : ""
                    }`}
                    onClick={handleCopy}
                    disabled={!copyableText || isCopying}
                  >
                    {isCopying
                      ? "Copiando..."
                      : copyFeedback?.tone === "success"
                        ? "Copiado!"
                        : "Copiar transcricao"}
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
                {activeImage.ocr.status === "PENDING" ||
                activeImage.ocr.status === "PROCESSING" ? (
                  <p className="muted">Transcricao em andamento para esta imagem.</p>
                ) : null}
                {activeImage.ocr.status === "NOT_REQUESTED" ? (
                  <p className="muted">Esta imagem nao foi selecionada para transcricao.</p>
                ) : null}
                {activeImage.ocr.status === "CANCELLED" ? (
                  <p className="muted">A transcricao desta imagem foi cancelada.</p>
                ) : null}
                {hasStructuredSections(activeImage) ? (
                  <StructuredContentView image={activeImage} />
                ) : structuredBlocks.length > 0 ? (
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
                {(hasStructuredSections(activeImage) || structuredBlocks.length > 0) &&
                activeImage.ocr.text ? (
                  <details className="technical-details">
                    <summary>Mostrar transcricao corrida</summary>
                    <pre className="ocr-text readable-text">{activeImage.ocr.text}</pre>
                  </details>
                ) : null}
                <p className="confidence-line">
                  Confianca da leitura: <strong>{formatConfidence(activeImage.ocr.confidence)}</strong>
                </p>
                {copyFeedback ? (
                  <p
                    className={
                      copyFeedback.tone === "success"
                        ? "copy-feedback copy-feedback-success"
                        : "copy-feedback copy-feedback-error"
                    }
                    role={copyFeedback.tone === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {copyFeedback.message}
                  </p>
                ) : null}
              </section>

              <section className="summary-grid result-status-grid">
                <div className="summary-item">
                  <span className="muted">Status da transcricao</span>
                  <strong>{imageStatusLabel(activeImage.ocr.status)}</strong>
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
                    <span className="muted">Estrategia</span>
                    <strong>{activeImage.ocr.strategyUsed ?? "n/d"}</strong>
                  </div>
                  <div className="summary-item">
                    <span className="muted">Preprocessamento</span>
                    <strong>{activeImage.ocr.preprocessingUsed ?? "n/d"}</strong>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <p className="muted">
              {emptyFilterLabel} Ajuste o filtro para explorar outro grupo de imagens.
            </p>
          )}
        </section>
      </section>

      <ImageLightbox image={activeImage} isOpen={isExpanded} onClose={() => setIsExpanded(false)} />
    </section>
  );
}
