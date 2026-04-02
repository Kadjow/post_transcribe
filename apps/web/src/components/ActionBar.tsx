interface ActionBarProps {
  totalImages: number;
  selectedCount: number;
  isSubmitting: boolean;
  onTranscribeAll: () => Promise<void>;
  onTranscribeNone: () => Promise<void>;
  onTranscribeSelected: () => Promise<void>;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function ActionBar({
  totalImages,
  selectedCount,
  isSubmitting,
  onTranscribeAll,
  onTranscribeNone,
  onTranscribeSelected,
  onSelectAll,
  onClearSelection
}: ActionBarProps): JSX.Element {
  const hasImages = totalImages > 0;
  const canSubmitSelected = selectedCount > 0 && !isSubmitting;

  return (
    <section className="card stack">
      <div className="row between">
        <h3>Acoes de transcricao</h3>
        <span className="muted">
          Selecionadas: {selectedCount} / {totalImages}
        </span>
      </div>
      <div className="row gap-sm wrap">
        <button type="button" onClick={onSelectAll} disabled={!hasImages || isSubmitting}>
          Selecionar todas
        </button>
        <button type="button" onClick={onClearSelection} disabled={!hasImages || isSubmitting}>
          Limpar selecao
        </button>
      </div>
      <div className="row gap-sm wrap">
        <button
          type="button"
          onClick={() => void onTranscribeAll()}
          disabled={!hasImages || isSubmitting}
        >
          {isSubmitting ? "Processando..." : "Transcrever todas"}
        </button>
        <button type="button" onClick={() => void onTranscribeNone()} disabled={isSubmitting}>
          Nao transcrever
        </button>
        <button
          type="button"
          onClick={() => void onTranscribeSelected()}
          disabled={!canSubmitSelected}
        >
          Transcrever selecionadas
        </button>
      </div>
    </section>
  );
}
