import { Component, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { getErrorGuidance } from "../utils/errorGuidance";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[AppErrorBoundary] Erro nao tratado no frontend", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign("/");
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const guidance = getErrorGuidance("frontend");

    return (
      <main className="app-shell">
        <ErrorState
          title={guidance.title}
          description={guidance.description}
          nextStep={guidance.nextStep}
          actions={[
            { label: "Recarregar pagina", onClick: this.handleReload },
            { label: "Voltar ao inicio", onClick: this.handleGoHome, tone: "secondary" }
          ]}
        />
      </main>
    );
  }
}
