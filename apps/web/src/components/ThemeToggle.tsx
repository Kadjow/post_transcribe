import { useTheme, type ThemePreference } from "../theme/ThemeProvider";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" }
];

export function ThemeToggle(): JSX.Element {
  const { themePreference, setThemePreference } = useTheme();

  return (
    <div className="theme-toggle-wrapper">
      <span className="theme-toggle-label">Tema</span>
      <div className="theme-toggle" role="radiogroup" aria-label="Selecionar tema">
        {THEME_OPTIONS.map((option) => {
          const isActive = themePreference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`theme-toggle-option ${isActive ? "is-active" : ""}`}
              onClick={() => setThemePreference(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

