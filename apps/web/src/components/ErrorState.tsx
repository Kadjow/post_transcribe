interface ErrorStateAction {
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary";
}

interface ErrorStateProps {
  title: string;
  description: string;
  nextStep: string;
  actions?: ErrorStateAction[];
  compact?: boolean;
}

export function ErrorState({
  title,
  description,
  nextStep,
  actions = [],
  compact = false
}: ErrorStateProps): JSX.Element {
  return (
    <section className={`card stack error-state ${compact ? "error-state-compact" : ""}`}>
      <h3>{title}</h3>
      <p className="error-state-description">{description}</p>
      <p className="error-state-next-step">
        <strong>Proximo passo:</strong> {nextStep}
      </p>
      {actions.length > 0 ? (
        <div className="row gap-sm wrap">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.tone === "secondary" ? "secondary-button" : undefined}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
