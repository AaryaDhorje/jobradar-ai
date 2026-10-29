import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "jobradar-theme";

function initialTheme(): Theme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return "dark";
  return "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* storage unavailable — theme still applies for this session */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
