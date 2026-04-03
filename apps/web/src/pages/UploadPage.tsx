import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState } from "../components/ErrorState";
import { PdfUploadForm } from "../components/PdfUploadForm";
import { analyzePdf } from "../services/pdfService";
import { getErrorGuidance } from "../utils/errorGuidance";

export function UploadPage(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const lastFileRef = useRef<File | null>(null);

  const handleSubmit = async (file: File) => {
    try {
      lastFileRef.current = file;
      setError(null);
      setIsLoading(true);
      const response = await analyzePdf(file, {
        ocrLanguages: "por+eng",
        thumbnailWidth: 320
      });
      navigate(`/review/${response.documentId}`);
    } catch (submitError) {
      console.error("Falha ao enviar PDF para analise", submitError);
      const reason =
        submitError instanceof Error ? submitError.message : "Falha no upload do arquivo.";
      setError(`Nao foi possivel analisar o PDF. ${reason}`);
    } finally {
      setIsLoading(false);
    }
  };

  const retryUpload = async () => {
    if (!lastFileRef.current) {
      setError(null);
      return;
    }
    await handleSubmit(lastFileRef.current);
  };

  const resetUpload = () => {
    setError(null);
    setFormKey((previous) => previous + 1);
    lastFileRef.current = null;
  };

  const guidance = error ? getErrorGuidance("upload", error) : null;

  return (
    <section className="upload-layout stack">
      <PdfUploadForm key={formKey} onSubmit={handleSubmit} isLoading={isLoading} />
      <section className="card how-it-works stack">
        <h3>Como funciona</h3>
        <div className="how-it-works-grid">
          <article className="how-it-works-item">
            <span className="how-it-works-badge">1</span>
            <p>Envie seu PDF</p>
          </article>
          <article className="how-it-works-item">
            <span className="how-it-works-badge">2</span>
            <p>Revise as imagens detectadas</p>
          </article>
          <article className="how-it-works-item">
            <span className="how-it-works-badge">3</span>
            <p>Transcreva o conteudo desejado</p>
          </article>
        </div>
        <p className="muted upload-benefit">
          Comece enviando um PDF para iniciar. O sistema organiza as imagens para facilitar a
          transcricao.
        </p>
      </section>
      {guidance ? (
        <ErrorState
          title={guidance.title}
          description={guidance.description}
          nextStep={guidance.nextStep}
          compact
          actions={[
            { label: "Tentar novamente", onClick: () => void retryUpload() },
            { label: "Recarregar pagina", onClick: () => window.location.reload() },
            { label: "Enviar outro arquivo", onClick: resetUpload, tone: "secondary" }
          ]}
        />
      ) : null}
    </section>
  );
}
