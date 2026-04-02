import { useEffect, useRef, useState } from "react";
import type { DocumentProcessingStatus, DocumentResult } from "../types/api";
import { getDocumentStatus, getResults } from "../services/pdfService";
import { POLLING_INTERVAL_MS } from "../utils/constants";

interface TranscriptionPollingState {
  data: DocumentResult | null;
  processing: DocumentProcessingStatus | null;
  isLoading: boolean;
  error: string | null;
}

export function useTranscriptionPolling(
  documentId: string | undefined
): TranscriptionPollingState {
  const [state, setState] = useState<TranscriptionPollingState>({
    data: null,
    processing: null,
    isLoading: false,
    error: null
  });
  const timerRef = useRef<number | null>(null);

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
        setState({
          data: null,
          processing: null,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to fetch OCR results."
        });
      }
    };

    void poll();

    return () => {
      isMounted = false;
      stopTimer();
    };
  }, [documentId]);

  return state;
}
