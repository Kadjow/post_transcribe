import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PdfUploadForm } from "../components/PdfUploadForm";
import { analyzePdf } from "../services/pdfService";

export function UploadPage(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (file: File) => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await analyzePdf(file, {
        ocrLanguages: "por+eng",
        thumbnailWidth: 320
      });
      navigate(`/review/${response.documentId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha no upload.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="stack">
      <PdfUploadForm onSubmit={handleSubmit} isLoading={isLoading} />
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
