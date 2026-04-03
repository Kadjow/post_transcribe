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
  const isSelectionEmpty = selectedCount === 0;

  return (
    <section className="card stack action-bar">
      <section className="stack tight action-bar-header">
        <h3>Acoes globais</h3>
        <p className="muted action-bar-subtitle">
          Defina a fila de imagens e escolha como iniciar a transcricao.
        </p>
      </section>

      <p className="action-bar-counter">
        <span className="muted">
          Fila pronta: {selectedCount} / {totalImages}
        </span>
      </p>

      <section className="stack tight action-selection-group">
        <p className="muted action-inline-label">Gestao de selecao</p>
        <div className="row gap-sm wrap action-selection-controls">
          <button
            type="button"
            className="secondary-button action-tool-button"
            onClick={onSelectAll}
            disabled={!hasImages || isSubmitting}
          >
            Selecionar todas
          </button>
          <button
            type="button"
            className="secondary-button action-tool-button"
            onClick={onClearSelection}
            disabled={!hasImages || isSubmitting}
          >
            Limpar selecao
          </button>
        </div>
      </section>

      <section className="action-primary-group">
        <button
          type="button"
          className="primary-cta action-selected-cta"
          onClick={() => void onTranscribeSelected()}
          disabled={!canSubmitSelected}
        >
          {isSubmitting
            ? "Iniciando..."
            : isSelectionEmpty
              ? "Selecione imagens para transcrever"
              : "Transcrever selecionadas"}
        </button>
      </section>

      <section className="stack tight action-secondary-group">
        <p className="muted action-inline-label">Outras acoes</p>
        <div className="row gap-sm wrap action-secondary-controls">
          <button
            type="button"
            className="secondary-button action-secondary-button"
            onClick={() => void onTranscribeAll()}
            disabled={!hasImages || isSubmitting}
          >
            Transcrever todas
          </button>
          <button
            type="button"
            className="secondary-button action-secondary-button action-secondary-danger"
            onClick={() => void onTranscribeNone()}
            disabled={isSubmitting}
          >
            Nao iniciar transcricao
          </button>
        </div>
      </section>

      <section className="action-bar-hints stack tight">
        <p className="muted action-bar-hint">
          A acao principal usa somente a fila de selecionadas para reduzir retrabalho.
        </p>
        {isSelectionEmpty ? (
          <p className="muted action-bar-hint">
            Dica: monte a fila nas secoes abaixo e inicie a transcricao por aqui.
          </p>
        ) : null}
      </section>
    </section>
  );
}
