import { useEffect, useRef, useState } from "react";
import type { DocumentProcessingStatus, DocumentResult } from "../types/api";
import { getDocumentStatus, getResults } from "../services/pdfService";
import { POLLING_INTERVAL_MS } from "../utils/constants";

interface TranscriptionPollingInternalState {
  data: DocumentResult | null;
  processing: DocumentProcessingStatus | null;
  isLoading: boolean;
  error: string | null;
}

interface TranscriptionPollingState extends TranscriptionPollingInternalState {
  retry: () => void;
}

export function useTranscriptionPolling(
  documentId: string | undefined
): TranscriptionPollingState {
  const [state, setState] = useState<TranscriptionPollingInternalState>({
    data: null,
    processing: null,
    isLoading: false,
    error: null
  });
  const timerRef = useRef<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!documentId) {
      return;
    }

    let isMounted = true;

    const stopTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const poll = async () => {
      try {
        setState((previous) => ({
          ...previous,
          isLoading: previous.data === null,
          error: null
        }));

        const [processing, result] = await Promise.all([
          getDocumentStatus(documentId),
          getResults(documentId)
        ]);

        if (!isMounted) {
          return;
        }

        setState({
          data: { ...result, processing },
          processing,
          isLoading: false,
          error: null
        });

        if (processing.stage === "ocr_running") {
          timerRef.current = window.setTimeout(poll, POLLING_INTERVAL_MS);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setState((previous) => ({
          ...previous,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Falha ao buscar os resultados da transcricao."
        }));
      }
    };

    void poll();

    return () => {
      isMounted = false;
      stopTimer();
    };
  }, [documentId, retryNonce]);

  const retry = () => {
    setRetryNonce((previous) => previous + 1);
  };

  return {
    ...state,
    retry
  };
}
