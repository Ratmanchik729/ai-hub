// Редактор своих тем: цвета, шрифты, форма, свой CSS, генерация нейросетью, экспорт/импорт JSON.
import { useEffect, useMemo, useState } from "react";
import type { Agent } from "../../../shared/types.ts";
import {
  BASE_HINTS,
  THEME_BASES,
  THEME_FONTS,
  THEME_TOKENS,
  sanitizeTheme,
  type CustomTheme,
  type ThemeBase,
  type TokenDef,
} from "../../../shared/themes.ts";
import { api } from "../api.ts";

export type ThemeDraft = Omit<CustomTheme, "id"> & { id?: string };

interface Props {
  initial: ThemeDraft;
  agents: Agent[];
  onPreview: (d: ThemeDraft) => void;
  onSaved: (t: CustomTheme) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}

// ---------- работа с цветами ----------

let ctx: CanvasRenderingContext2D | null = null;
/** Любой CSS-цвет → { hex: "#rrggbb", alpha }. */
function parseColor(v: string): { hex: string; alpha: number } {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return { hex: "#000000", alpha: 1 };
  ctx.fillStyle = "#000000";
  ctx.fillStyle = v;
  const c = String(ctx.fillStyle);
  if (c.startsWith("#")) return { hex: c, alpha: 1 };
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { hex: "#000000", alpha: 1 };
  const hex = "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
  return { hex, alpha: m[4] !== undefined ? Number(m[4]) : 1 };
}

function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Number(alpha.toFixed(2))})`;
}

/** Текущие значения всех переменных со страницы — стартовая точка для новой темы. */
export function captureCurrentVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const def of THEME_TOKENS) {
    const raw = cs.getPropertyValue(`--${def.key}`).trim();
    if (!raw) continue;
    if (def.type === "font") {
      const first = raw.split(",")[0].replace(/["']/g, "").trim();
      const name = Object.keys(THEME_FONTS).find((k) => THEME_FONTS[k].split(",")[0].replace(/["']/g, "").trim() === first);
      if (name) out[def.key] = name;
    } else if (def.type === "logo") {
      out[def.key] = raw.replace(/^["']|["']$/g, "") || "◆";
    } else if (def.type === "radius" || def.type === "size") {
      out[def.key] = `${parseInt(raw, 10) || 0}px`;
    } else {
      const { hex, alpha } = parseColor(raw);
      out[def.key] = withAlpha(hex, alpha);
    }
  }
  if (!out.logo) out.logo = "◆";
  return out;
}

function fieldsWord(n: number) {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? "поле" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "поля" : "полей";
  return `${n} ${w}`;
}

// ---------- компонент ----------

const GROUPS = [...new Set(THEME_TOKENS.map((t) => t.group))];

export function ThemeEditor({ initial, agents, onPreview, onSaved, onDeleted, onClose }: Props) {
  const [d, setD] = useState<ThemeDraft>(initial);
  const [open, setOpen] = useState<string>("Основа");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [genText, setGenText] = useState("");
  const [genAgent, setGenAgent] = useState(agents[0]?.id ?? "");
  const [gen, setGen] = useState<"idle" | "busy">("idle");
  const [genNote, setGenNote] = useState<string | null>(null);

  useEffect(() => onPreview(d), [d]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const setVar = (k: string, v: string) => setD((x) => ({ ...x, vars: { ...x.vars, [k]: v } }));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const body = sanitizeTheme(d);
      const t = d.id ? await api.updateTheme(d.id, body) : await api.createTheme(body);
      onSaved(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!d.id || !confirm(`Удалить тему «${d.name}»?`)) return;
    await api.deleteTheme(d.id);
    onDeleted(d.id);
  };

  const exportJson = () => {
    const { id, created_at, ...rest } = d as CustomTheme;
    void id;
    void created_at;
    const blob = new Blob([JSON.stringify({ ...rest, format: "ai-hub-theme@1" }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${d.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").toLowerCase() || "theme"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const generate = async () => {
    setError(null);
    setGenNote(null);
    setGen("busy");
    try {
      const t = await api.generateTheme(genAgent, genText);
      // поля, которые модель не заполнила, оставляем как были
      setD((x) => ({ ...x, name: t.name, base: t.base, vars: { ...x.vars, ...t.vars } }));
      setGenNote(
        t.missing.length
          ? `Готово. ${fieldsWord(t.missing.length)} модель не задала — для них оставлены прежние значения.`
          : "Готово. Подправь, что не нравится, и сохрани.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGen("idle");
    }
  };

  const byGroup = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g, THEME_TOKENS.filter((t) => t.group === g)])), []);

  return (
    <aside className="theme-editor" data-title="РЕДАКТОР ТЕМЫ">
      <div className="te-head">
        <input className="te-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <button className="icon" onClick={onClose} title="Закрыть без сохранения (Esc)">
          ×
        </button>
      </div>

      <div className="te-body">
        <section className="te-gen">
          <div className="label">🪄 Сделать нейросетью</div>
          {agents.length ? (
            <>
              <textarea
                rows={2}
                value={genText}
                placeholder="например: ночной Токио, неон, киберпанк; или: уютная осень, тёплые цвета"
                onChange={(e) => setGenText(e.target.value)}
              />
              <div className="te-row">
                <select value={genAgent} onChange={(e) => setGenAgent(e.target.value)}>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.model}
                    </option>
                  ))}
                </select>
                <button className="primary" onClick={generate} disabled={gen === "busy" || !genText.trim()}>
                  {gen === "busy" ? "Думает…" : "Создать"}
                </button>
              </div>
              {genNote && <div className="small ok-line">{genNote}</div>}
            </>
          ) : (
            <div className="muted small">Сначала добавь хотя бы одного агента — он и будет дизайнером.</div>
          )}
        </section>

        <section>
          <div className="label">Основа</div>
          <div className="te-bases">
            {THEME_BASES.map((b) => (
              <button key={b} className={d.base === b ? "active" : ""} onClick={() => setD({ ...d, base: b as ThemeBase })} title={BASE_HINTS[b]}>
                {b.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="muted small">{BASE_HINTS[d.base]}</div>
        </section>

        {GROUPS.map((g) => (
          <section key={g} className="te-group">
            <button className="te-group-head" onClick={() => setOpen(open === g ? "" : g)}>
              {open === g ? "▾" : "▸"} {g}
            </button>
            {open === g && byGroup[g].map((t) => <TokenRow key={t.key} def={t} value={d.vars[t.key]} onChange={(v) => setVar(t.key, v)} />)}
          </section>
        ))}

        <section className="te-group">
          <button className="te-group-head" onClick={() => setOpen(open === "css" ? "" : "css")}>
            {open === "css" ? "▾" : "▸"} Свой CSS (для продвинутых)
          </button>
          {open === "css" && (
            <>
              <textarea
                className="te-css"
                rows={8}
                spellCheck={false}
                value={d.css}
                placeholder={`/* например: */\n.msg.user .bubble { font-style: italic; }\n.statusbar { letter-spacing: .1em; }`}
                onChange={(e) => setD({ ...d, css: e.target.value })}
              />
              <div className="muted small">Применяется поверх темы. Все переменные — в README, раздел «Темы».</div>
            </>
          )}
        </section>
      </div>

      {error && <div className="error-line small te-err">{error}</div>}
      <div className="te-foot">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
        <button onClick={exportJson}>Экспорт JSON</button>
        {d.id && (
          <button className="danger" onClick={remove}>
            Удалить
          </button>
        )}
      </div>
    </aside>
  );
}

function TokenRow({ def, value, onChange }: { def: TokenDef; value: string | undefined; onChange: (v: string) => void }) {
  const v = value ?? "";
  if (def.type === "color") {
    const { hex, alpha } = parseColor(v || "#000000");
    return (
      <label className="te-token">
        <span className="te-label">{def.label}</span>
        <input type="color" value={hex} onChange={(e) => onChange(withAlpha(e.target.value, alpha))} />
        <input className="te-val" value={v} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      </label>
    );
  }
  if (def.type === "font") {
    return (
      <label className="te-token">
        <span className="te-label">{def.label}</span>
        <select value={v} onChange={(e) => onChange(e.target.value)}>
          {!v && <option value="">—</option>}
          {Object.keys(THEME_FONTS).map((f) => (
            <option key={f} value={f} style={{ fontFamily: THEME_FONTS[f] }}>
              {f}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (def.type === "radius" || def.type === "size") {
    const n = parseInt(v, 10);
    const [min, max] = def.type === "radius" ? [0, 30] : [11, 22];
    return (
      <label className="te-token">
        <span className="te-label">
          {def.label}: {Number.isFinite(n) ? n : "—"}px
        </span>
        <input type="range" min={min} max={max} value={Number.isFinite(n) ? n : min} onChange={(e) => onChange(`${e.target.value}px`)} />
      </label>
    );
  }
  return (
    <label className="te-token">
      <span className="te-label">{def.label}</span>
      <input className="te-val te-logo" value={v} maxLength={4} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
