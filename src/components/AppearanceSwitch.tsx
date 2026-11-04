"use client";

import { useEffect, useState } from "react";

type Theme = "auto" | "light" | "dark";
const OPTIONS: [Theme, string][] = [
  ["auto", "Automatic"],
  ["light", "Light"],
  ["dark", "Dark"],
];
const EVENT = "cms-theme-change";

declare global {
  interface Window {
    __applyTheme?: (theme: Theme) => void;
  }
}

/** Automatic follows the device. The choice is remembered per device, not per account. */
export function AppearanceSwitch() {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
    // Keeps the sidebar and the sheet in step, since both exist on the page.
    const sync = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  function choose(next: Theme) {
    window.__applyTheme?.(next);
    try {
      if (next === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }

  return (
    <div className="appearance">
      <h3>Appearance</h3>
      <div className="tabs" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            className={theme === value ? "active" : ""}
            onClick={() => choose(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
