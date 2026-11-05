import { useEffect, useState } from "react";
import { THEME_TOKENS, tokenToCss, type CustomTheme, type ThemeBase } from "../../shared/themes.ts";

export type Theme = ThemeBase;
/** Встроенная тема или своя: "custom:<id>". */
export type ThemeId = Theme | `custom:${string}`;
export type EvaScheme = "01" | "02" | "00";

export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "temple", label: "TEMPLE", hint: "16 цветов EGA, двойные рамки, пиксели" },
  { id: "dark", label: "DARK", hint: "спокойная тёмная" },
  { id: "kuro", label: "KURO", hint: "чёрный, фиолетовый и розовый, черепки и сердечки" },
  { id: "eva", label: "EVA", hint: "угловатые панели, шестиугольники, три гаммы" },
];

export const EVA_SCHEMES: { id: EvaScheme; label: string }[] = [
  { id: "01", label: "01 · пурпур/зелёный" },
  { id: "02", label: "02 · красный/оранжевый" },
  { id: "00", label: "00 · синий/белый" },
];

/** Тёмные темы — для React Flow и прочего, что различает light/dark. */
export const isDarkTheme = (t: Theme) => t !== "temple";

function read<T>(key: string, def: T, ok: (v: unknown) => boolean = () => true): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return def;
    const v = JSON.parse(raw);
    return ok(v) ? (v as T) : def;
  } catch {
    return def;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* приватный режим и т.п. */
  }
}

function usePersisted<T>(key: string, def: T, ok?: (v: unknown) => boolean) {
  const [v, setV] = useState<T>(() => read(key, def, ok));
  useEffect(() => write(key, v), [key, v]);
  return [v, setV] as const;
}

export function useThemeId() {
  return usePersisted<ThemeId>(
    "ai-hub-theme-v2",
    legacyTheme(),
    (v) => THEMES.some((t) => t.id === v) || (typeof v === "string" && v.startsWith("custom:")),
  );
}

// ---------- применение темы к странице ----------

let appliedKeys: string[] = [];

/** Ставит основу и переменные своей темы (vars = null — встроенная тема без переопределений). */
export function applyTheme(base: Theme, vars: Record<string, string> | null, css: string) {
  const root = document.documentElement;
  root.dataset.theme = base;
  for (const k of appliedKeys) root.style.removeProperty(`--${k}`);
  appliedKeys = [];
  if (vars) {
    for (const def of THEME_TOKENS) {
      const v = vars[def.key];
      if (v === undefined) continue;
      root.style.setProperty(`--${def.key}`, tokenToCss(def, v));
      appliedKeys.push(def.key);
    }
  }
  let tag = document.getElementById("ai-hub-custom-css");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "ai-hub-custom-css";
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

export function resolveTheme(id: ThemeId, custom: CustomTheme[]) {
  if (id.startsWith("custom:")) {
    const t = custom.find((x) => `custom:${x.id}` === id);
    if (t) return { base: t.base as Theme, vars: t.vars, css: t.css, custom: t };
    return { base: "dark" as Theme, vars: null, css: "", custom: null };
  }
  return { base: id as Theme, vars: null, css: "", custom: null };
}

// v1 хранил тему строкой без JSON
function legacyTheme(): Theme {
  try {
    const v = localStorage.getItem("ai-hub-theme");
    if (v === "dark" || v === "temple") return v;
  } catch {
    /* ignore */
  }
  return "temple";
}

export function useEvaScheme() {
  const [scheme, setScheme] = usePersisted<EvaScheme>("ai-hub-eva", "01", (v) =>
    EVA_SCHEMES.some((s) => s.id === v),
  );
  useEffect(() => {
    document.documentElement.dataset.eva = scheme;
  }, [scheme]);
  return [scheme, setScheme] as const;
}

// ---------- свой фон ----------

export interface Background {
  enabled: boolean;
  source: "upload" | "url";
  url: string;
  opacity: number; // 0.05 … 1
  blur: number; // px
  fit: "cover" | "contain" | "tile";
  /** меняется при загрузке нового файла — сбивает кэш браузера */
  version: number;
}

const DEFAULT_BG: Background = {
  enabled: false,
  source: "upload",
  url: "",
  opacity: 0.25,
  blur: 0,
  fit: "cover",
  version: 0,
};

export function useBackground() {
  const [bg, setBg] = usePersisted<Background>("ai-hub-bg", DEFAULT_BG, (v) => typeof v === "object" && v !== null);
  const full = { ...DEFAULT_BG, ...bg };
  useEffect(() => {
    document.documentElement.dataset.bg = full.enabled ? "on" : "off";
  }, [full.enabled]);
  const update = (patch: Partial<Background>) => setBg({ ...full, ...patch });
  return [full, update] as const;
}

export function backgroundSrc(bg: Background): string | null {
  if (!bg.enabled) return null;
  if (bg.source === "url") return bg.url.trim() || null;
  return `/api/background?v=${bg.version}`;
}

/** Цвета агентов — 16-цветная палитра EGA (без белого и серых): хорошо видны во всех темах. */
export const AGENT_COLORS = [
  "#0000AA", "#00AA00", "#00AAAA", "#AA0000", "#AA00AA", "#AA5500",
  "#5555FF", "#55FF55", "#55FFFF", "#FF5555", "#FF55FF", "#FFFF55",
];
