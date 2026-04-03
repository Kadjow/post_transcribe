import type { DocumentProcessingStatus, DocumentResult } from "../types/api";
import {
  analysisProgressValue,
  analysisStatusLabel,
  flowStateDescription,
  flowStateLabel,
  isWaitingForUserSelection,
  ocrProgressValue,
  ocrStatusLabel,
  processingStageLabel,
  processingTone
} from "../utils/processing";
import { StatusBadge } from "./StatusBadge";

interface DocumentProgressPanelProps {
  documentId: string;
  processing: DocumentProcessingStatus | null;
  result: DocumentResult | null;
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function DocumentProgressPanel({
  documentId,
  processing,
  result
}: DocumentProgressPanelProps): JSX.Element {
  const summary = result?.summary;
  const flowLabel = flowStateLabel(processing, result);
  const flowDescription = flowStateDescription(processing, result);
  const analysisProgress = analysisProgressValue(processing);
  const ocrProgress = ocrProgressValue(processing, result);
  const waitingForUserSelection = isWaitingForUserSelection(processing, result);

  const totalPages = safeCount(processing?.totalPages ?? summary?.pagesTotal);
  const pagesProcessed = safeCount(processing?.pagesProcessed);
  const imagesFound = safeCount(processing?.imagesFound ?? summary?.imagesTotal);
  const imagesSelected = safeCount(
    processing?.imagesSelected ?? summary?.selectedForTranscription
  );
  const imagesSucceeded = safeCount(
    processing?.imagesSucceeded ?? summary?.transcribedTotal
  );
  const imagesFailed = safeCount(processing?.imagesFailed);
  const imagesCancelled = safeCount(processing?.imagesCancelled);
  const imagesProcessed = safeCount(processing?.imagesProcessed);
  const imagesPending = Math.max(imagesFound - imagesSucceeded - imagesFailed - imagesCancelled, 0);

  const nextStepMessage = (() => {
    if (!processing) {
      return "Aguarde os dados iniciais do documento para continuar.";
    }
    if (processing.stage === "ready_for_selection") {
      return "Selecione as imagens desejadas e inicie a transcricao.";
    }
    if (processing.stage === "ocr_running") {
      return "Acompanhe a transcricao em tempo real e revise as imagens com erro ao final.";
    }
    if (processing.stage === "cancelled") {
      return "A transcricao foi cancelada. Se necessario, selecione novas imagens e inicie novamente.";
    }
    if (processing.stage === "completed") {
      return "Fluxo finalizado. Revise os resultados de leitura na lista de imagens.";
    }
    if (processing.stage === "completed_with_errors") {
      return "Transcricao concluida com erros. Priorize as imagens em vermelho para revisao.";
    }
    if (processing.stage === "failed") {
      return "Processo interrompido. Revise a mensagem de erro para decidir o proximo passo.";
    }
    return "Aguarde a conclusao da analise automatica para seguir para a selecao de imagens.";
  })();

  return (
    <section className="card stack progress-panel">
      <div className="row between">
        <div className="stack tight">
          <h2>Documento em processamento</h2>
          <p className="muted">ID: {documentId}</p>
        </div>
        {processing ? (
          <StatusBadge
            label={processingStageLabel(processing.stage)}
            tone={processingTone(processing.stage)}
          />
        ) : (
          <StatusBadge label="Carregando status..." tone="neutral" />
        )}
      </div>

      <div className="state-highlight stack tight">
        <div className="row between">
          <strong>Etapa atual</strong>
          <span className="muted">{processing ? processingStageLabel(processing.stage) : "Aguardando"}</span>
        </div>
        <div className="row between">
          <strong className="muted">Estado do fluxo</strong>
          <span className="muted">{flowLabel}</span>
        </div>
        <p className="muted">{flowDescription}</p>
        <p className="muted">{processing?.message ?? "Aguardando atualizacao..."}</p>
      </div>

      <div className="progress-breakdown">
        <section className="stack tight progress-item">
          <div className="row between">
            <strong>Analise do PDF</strong>
            <span className="muted">{analysisProgress}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Progresso da analise do PDF"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={analysisProgress}
          >
            <div className="progress-fill" style={{ width: `${analysisProgress}%` }} />
          </div>
          <p className="muted">{analysisStatusLabel(processing, result)}</p>
        </section>

        <section className="stack tight progress-item">
          <div className="row between">
            <strong>Transcricao</strong>
            <span className="muted">{ocrProgress}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Progresso da transcricao"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ocrProgress}
          >
            <div className="progress-fill" style={{ width: `${ocrProgress}%` }} />
          </div>
          <p className="muted">{ocrStatusLabel(processing, result)}</p>
        </section>
      </div>

      {waitingForUserSelection ? (
        <p className="info">
          Analise concluida. A transcricao ainda nao foi iniciada. Selecione as imagens e clique
          em uma acao de transcricao.
        </p>
      ) : null}

      <div className="summary-grid status-summary-grid">
        <div className="summary-item">
          <span className="muted">Imagens totais</span>
          <strong>{imagesFound}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Transcritas</span>
          <strong>{imagesSucceeded}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Pendentes</span>
          <strong>{imagesPending}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Canceladas</span>
          <strong>{imagesCancelled}</strong>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-item">
          <span className="muted">Paginas</span>
          <strong>
            {pagesProcessed}/{totalPages}
          </strong>
        </div>
        <div className="summary-item">
          <span className="muted">Imagens</span>
          <strong>{imagesFound}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Selecionadas</span>
          <strong>{imagesSelected}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Processadas</span>
          <strong>{imagesProcessed}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Concluidas</span>
          <strong>{imagesSucceeded}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Com erro</span>
          <strong>{imagesFailed}</strong>
        </div>
        <div className="summary-item">
          <span className="muted">Canceladas</span>
          <strong>{imagesCancelled}</strong>
        </div>
      </div>

      <p className="next-step-callout">
        <strong>Proximo passo:</strong> {nextStepMessage}
      </p>

      {processing?.hasError ? (
        <p className="error">
          {processing.errorMessage ??
            "Ocorreram erros durante o processamento. Revise os itens afetados."}
        </p>
      ) : null}
    </section>
  );
}
