// Формат пользовательских тем. Общий для сервера (проверка, генерация нейросетью) и интерфейса (редактор).
//
// Тема = основа (встроенная тема, от которой берутся форма и декор) + набор CSS-переменных + необязательный CSS.

export const THEME_BASES = ["temple", "dark", "kuro", "eva"] as const;
export type ThemeBase = (typeof THEME_BASES)[number];

export const BASE_HINTS: Record<ThemeBase, string> = {
  temple: "ретро: двойные рамки, кнопки в [скобках], без скруглений",
  dark: "современная: аккуратные рамки и скругления",
  kuro: "мягкая: круглые кнопки, градиенты, узор из черепков и сердечек",
  eva: "угловатая: срезанные углы, шестиугольники, полосы «опасность»",
};

export type TokenType = "color" | "font" | "radius" | "size" | "logo";

export interface TokenDef {
  key: string; // имя CSS-переменной без --
  label: string;
  group: "Основа" | "Акценты" | "Статусы" | "Код" | "Шрифты и форма";
  type: TokenType;
}

export const THEME_TOKENS: TokenDef[] = [
  { key: "bg", label: "Фон страницы", group: "Основа", type: "color" },
  { key: "panel", label: "Панели", group: "Основа", type: "color" },
  { key: "panel-solid", label: "Панели (непрозрачные: меню, оверлеи)", group: "Основа", type: "color" },
  { key: "panel2", label: "Вложенные блоки", group: "Основа", type: "color" },
  { key: "border", label: "Рамки", group: "Основа", type: "color" },
  { key: "border-soft", label: "Рамки (фокус)", group: "Основа", type: "color" },
  { key: "text", label: "Текст", group: "Основа", type: "color" },
  { key: "muted", label: "Приглушённый текст", group: "Основа", type: "color" },
  { key: "grid", label: "Сетка офиса", group: "Основа", type: "color" },

  { key: "accent", label: "Главный акцент", group: "Акценты", type: "color" },
  { key: "accent2", label: "Второй акцент", group: "Акценты", type: "color" },
  { key: "accent-text", label: "Текст на акценте", group: "Акценты", type: "color" },
  { key: "hover-bg", label: "Подсветка при наведении", group: "Акценты", type: "color" },
  { key: "hover-text", label: "Текст при наведении", group: "Акценты", type: "color" },
  { key: "sel-bg", label: "Выделение текста", group: "Акценты", type: "color" },
  { key: "sel-text", label: "Текст выделения", group: "Акценты", type: "color" },
  { key: "user", label: "Сообщения пользователя", group: "Акценты", type: "color" },

  { key: "ok", label: "Успех / коллеги", group: "Статусы", type: "color" },
  { key: "warn", label: "Предупреждение", group: "Статусы", type: "color" },
  { key: "danger", label: "Ошибка / удаление", group: "Статусы", type: "color" },
  { key: "thinking", label: "Рассуждения моделей", group: "Статусы", type: "color" },

  { key: "code-bg", label: "Фон кода", group: "Код", type: "color" },
  { key: "code-text", label: "Текст кода", group: "Код", type: "color" },
  { key: "c-keyword", label: "Ключевые слова", group: "Код", type: "color" },
  { key: "c-string", label: "Строки", group: "Код", type: "color" },
  { key: "c-number", label: "Числа", group: "Код", type: "color" },
  { key: "c-comment", label: "Комментарии", group: "Код", type: "color" },
  { key: "c-title", label: "Функции", group: "Код", type: "color" },
  { key: "c-builtin", label: "Типы и встроенное", group: "Код", type: "color" },
  { key: "c-attr", label: "Атрибуты и переменные", group: "Код", type: "color" },

  { key: "font", label: "Шрифт интерфейса", group: "Шрифты и форма", type: "font" },
  { key: "font-head", label: "Шрифт заголовков", group: "Шрифты и форма", type: "font" },
  { key: "font-text", label: "Шрифт сообщений", group: "Шрифты и форма", type: "font" },
  { key: "font-size", label: "Размер текста интерфейса", group: "Шрифты и форма", type: "size" },
  { key: "font-text-size", label: "Размер текста сообщений", group: "Шрифты и форма", type: "size" },
  { key: "radius", label: "Скругление углов", group: "Шрифты и форма", type: "radius" },
  { key: "logo", label: "Значок логотипа", group: "Шрифты и форма", type: "logo" },
];

/** Шрифты, которые уже подключены в проекте (+ системные). */
export const THEME_FONTS: Record<string, string> = {
  "Pixelify Sans": '"Pixelify Sans", ui-monospace, monospace',
  "Press Start 2P": '"Press Start 2P", monospace',
  Nunito: '"Nunito", system-ui, sans-serif',
  Comfortaa: '"Comfortaa", "Nunito", sans-serif',
  Oswald: '"Oswald", "Arial Narrow", sans-serif',
  "Системный": 'system-ui, "Segoe UI", "Noto Sans", sans-serif',
  "Моноширинный": 'ui-monospace, "DejaVu Sans Mono", "Liberation Mono", monospace',
  "С засечками": 'Georgia, "Times New Roman", serif',
};

export interface CustomTheme {
  id: string;
  name: string;
  base: ThemeBase;
  /** ключ токена → значение. Для шрифтов — имя из THEME_FONTS, для логотипа — сам символ. */
  vars: Record<string, string>;
  /** свой CSS (пишет человек; нейросетью не генерируется) */
  css: string;
  created_at?: string;
}

const COLOR_RE =
  /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|hsla?\(\s*[\d.]+(deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+%?\s*)?\)|transparent)$/i;

/** Проверка одного значения. Возвращает нормализованное значение или null. */
export function sanitizeToken(def: TokenDef, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  switch (def.type) {
    case "color":
      return COLOR_RE.test(v) ? v : null;
    case "font":
      return v in THEME_FONTS ? v : null;
    case "radius": {
      const m = v.match(/^(\d{1,2})(px)?$/);
      return m && Number(m[1]) <= 30 ? `${m[1]}px` : null;
    }
    case "size": {
      const m = v.match(/^(\d{1,2})(px)?$/);
      return m && Number(m[1]) >= 11 && Number(m[1]) <= 22 ? `${m[1]}px` : null;
    }
    case "logo": {
      const chars = [...v];
      return chars.length >= 1 && chars.length <= 2 && !/["'\\<>{};]/.test(v) ? v : null;
    }
  }
}

/** Оставляет только известные токены с корректными значениями. */
export function sanitizeVars(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const def of THEME_TOKENS) {
    const v = sanitizeToken(def, (input as Record<string, unknown>)[def.key]);
    if (v !== null) out[def.key] = v;
  }
  return out;
}

/** "#rgb" / "#rrggbb" / "rgb(a)(…)" → [r, g, b] или null. */
function rgb(v: string | undefined): [number, number, number] | null {
  if (!v) return null;
  let m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as [number, number, number];
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}
const rgba = (v: string | undefined, a: number) => {
  const c = rgb(v);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})` : undefined;
};
const solid = (v: string | undefined) => {
  const c = rgb(v);
  return c ? "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("") : undefined;
};

/**
 * Дозаполняет пропущенные токены из заданных — чтобы тема от нейросети была цельной,
 * даже если модель заполнила не всё.
 */
export function fillMissing(vars: Record<string, string>): Record<string, string> {
  const v = { ...vars };
  const derive: [string, () => string | undefined][] = [
    ["panel", () => v.bg],
    ["panel-solid", () => solid(v.panel) ?? v.bg],
    ["panel2", () => v.panel],
    ["border", () => v.muted ?? v.accent],
    ["border-soft", () => v.accent],
    ["muted", () => rgba(v.text, 0.65)],
    ["grid", () => v.border],
    ["accent2", () => v.accent],
    ["accent-text", () => v.bg],
    ["hover-bg", () => rgba(v.accent, 0.15)],
    ["hover-text", () => v.text],
    ["sel-bg", () => v.accent],
    ["sel-text", () => v["accent-text"] ?? v.bg],
    ["user", () => v.accent2 ?? v.accent],
    ["ok", () => v.accent],
    ["warn", () => v.accent2 ?? v.accent],
    ["danger", () => "#e5484d"],
    ["thinking", () => v.muted],
    ["code-bg", () => v.panel2 ?? v.bg],
    ["code-text", () => v.text],
    ["c-keyword", () => v.accent2 ?? v.accent],
    ["c-string", () => v.ok],
    ["c-number", () => v.warn],
    ["c-comment", () => v.muted],
    ["c-title", () => v.accent],
    ["c-builtin", () => v["border-soft"] ?? v.accent],
    ["c-attr", () => v.text],
    ["font-head", () => v.font],
    ["font-text", () => v.font],
  ];
  for (const [k, f] of derive) {
    if (v[k] !== undefined) continue;
    const x = f();
    const def = THEME_TOKENS.find((t) => t.key === k);
    if (x !== undefined && def && sanitizeToken(def, x) !== null) v[k] = x;
  }
  return v;
}

/** Значение токена → значение CSS-переменной. */
export function tokenToCss(def: TokenDef, v: string): string {
  if (def.type === "font") return THEME_FONTS[v] ?? v;
  if (def.type === "logo") return JSON.stringify(v);
  return v;
}

/** Проверка темы целиком (импорт JSON, сохранение). css принимается как есть, но с ограничением длины. */
export function sanitizeTheme(input: unknown): Omit<CustomTheme, "id"> {
  const o = (input ?? {}) as Record<string, unknown>;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : "Моя тема";
  const base = THEME_BASES.includes(o.base as ThemeBase) ? (o.base as ThemeBase) : "dark";
  const css = typeof o.css === "string" ? o.css.slice(0, 20_000) : "";
  return { name, base, vars: sanitizeVars(o.vars), css };
}

/** Текст инструкции для нейросети, которая генерирует тему. */
export function themeGenerationPrompt(): string {
  const tokens = THEME_TOKENS.map((t) => {
    const hint =
      t.type === "color"
        ? "цвет: #rrggbb или rgba(r,g,b,a)"
        : t.type === "font"
          ? `одно из: ${Object.keys(THEME_FONTS).join(" | ")}`
          : t.type === "radius"
            ? "число пикселей 0–30, например 8px"
            : t.type === "size"
              ? "число пикселей 11–22, например 15px"
              : "1–2 символа (эмодзи или знак)";
    return `- "${t.key}" — ${t.label} (${hint})`;
  }).join("\n");
  return `Ты — дизайнер цветовых тем для веб-интерфейса чата с нейросетями.
По описанию пользователя придумай тему и верни ТОЛЬКО JSON без пояснений и без markdown:

{"name": "короткое название", "base": "temple|dark|kuro|eva", "vars": { ... }}

Основы (форма интерфейса, цвета ты задаёшь сам):
${THEME_BASES.map((b) => `- "${b}" — ${BASE_HINTS[b]}`).join("\n")}

Переменные (заполни все):
${tokens}

Требования:
- Текст должен хорошо читаться на фоне (контраст не ниже 4.5:1 для text на bg и panel).
- "accent-text" должен читаться на "accent".
- "panel" можно сделать полупрозрачным через rgba, "panel-solid" — непрозрачный вариант того же цвета.
- Цвета подсветки кода должны различаться между собой и читаться на "code-bg".
- Название — на языке пользователя.`;
}

/** Достаёт первый JSON-объект из ответа модели (на случай, если она всё же добавила текст или ```). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Модель не вернула JSON");
  return JSON.parse(src.slice(start, end + 1));
}
