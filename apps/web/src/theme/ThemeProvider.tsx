import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "pdf-transcribe-theme";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(THEME_MEDIA_QUERY).matches;
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedValue) ? storedValue : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(
  themePreference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (themePreference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return themePreference;
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(themePreference, systemPrefersDark),
    [themePreference, systemPrefersDark]
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = themePreference;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themePreference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // Intencional: falhas de storage nao devem quebrar a aplicacao.
    }
  }, [themePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference
    }),
    [themePreference, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  }
  return context;
}

