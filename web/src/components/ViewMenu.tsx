// Меню «Вид»: тема, гамма EVA, свой фон.
import { useEffect, useRef, useState } from "react";
import {
  EVA_SCHEMES,
  THEMES,
  backgroundSrc,
  type Background,
  type EvaScheme,
  type Theme,
  type ThemeId,
} from "../theme.ts";
import { sanitizeTheme, type CustomTheme } from "../../../shared/themes.ts";
import { api } from "../api.ts";

interface Props {
  themeId: ThemeId;
  setThemeId: (t: ThemeId) => void;
  /** основа активной темы */
  theme: Theme;
  custom: CustomTheme[];
  onNewTheme: () => void;
  onEditTheme: (t: CustomTheme) => void;
  onThemesChanged: (select?: CustomTheme) => void;
  scheme: EvaScheme;
  setScheme: (s: EvaScheme) => void;
  bg: Background;
  setBg: (p: Partial<Background>) => void;
}

export function ViewMenu({
  themeId,
  setThemeId,
  theme,
  custom,
  onNewTheme,
  onEditTheme,
  onThemesChanged,
  scheme,
  setScheme,
  bg,
  setBg,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const themeFile = useRef<HTMLInputElement>(null);
  const active = custom.find((t) => `custom:${t.id}` === themeId) ?? null;

  const importTheme = async (f: File) => {
    setError(null);
    try {
      const parsed = JSON.parse(await f.text());
      const t = await api.createTheme(sanitizeTheme(parsed));
      onThemesChanged(t);
    } catch (e) {
      setError(`Импорт: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const upload = async (f: File) => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/background", { method: "PUT", headers: { "Content-Type": f.type }, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
      setBg({ enabled: true, source: "upload", version: Date.now() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeUpload = async () => {
    await fetch("/api/background", { method: "DELETE" });
    setBg({ enabled: false, version: Date.now() });
  };

  const label = active ? active.name.toUpperCase() : (THEMES.find((t) => t.id === themeId)?.label ?? theme);

  return (
    <div className="view-menu" ref={ref}>
      <button className="sb-theme" onClick={() => setOpen((o) => !o)} title="Тема и фон">
        ВИД:{label}
        {themeId === "eva" ? `-${scheme}` : ""}
      </button>
      {themeId === "eva" && (
        <button
          className="sb-theme eva-cycle"
          title="Следующая гамма"
          onClick={() => {
            const i = EVA_SCHEMES.findIndex((s) => s.id === scheme);
            setScheme(EVA_SCHEMES[(i + 1) % EVA_SCHEMES.length].id);
          }}
        >
          ⇄
        </button>
      )}

      {open && (
        <div className="view-pop" data-title="ВИД">
          <div className="label">Тема</div>
          <div className="view-themes">
            {THEMES.map((t) => (
              <button key={t.id} className={themeId === t.id ? "active" : ""} onClick={() => setThemeId(t.id)} title={t.hint}>
                {t.label}
              </button>
            ))}
          </div>
          {!active && <div className="muted small">{THEMES.find((t) => t.id === themeId)?.hint}</div>}

          <div className="label">Свои темы</div>
          {custom.length > 0 && (
            <div className="view-themes">
              {custom.map((t) => (
                <button
                  key={t.id}
                  className={themeId === `custom:${t.id}` ? "active" : ""}
                  onClick={() => setThemeId(`custom:${t.id}`)}
                  title={`основа: ${t.base}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="view-row wrap">
            <button
              onClick={() => {
                setOpen(false);
                onNewTheme();
              }}
              title="Новая тема на основе текущей — вручную или нейросетью"
            >
              + Новая
            </button>
            {active && (
              <button
                onClick={() => {
                  setOpen(false);
                  onEditTheme(active);
                }}
              >
                ✎ Изменить
              </button>
            )}
            <button onClick={() => themeFile.current?.click()}>Импорт JSON</button>
            <input
              ref={themeFile}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importTheme(f);
                e.target.value = "";
              }}
            />
          </div>

          {themeId === "eva" && (
            <>
              <div className="label">Гамма</div>
              <div className="view-themes col">
                {EVA_SCHEMES.map((s) => (
                  <button key={s.id} className={scheme === s.id ? "active" : ""} onClick={() => setScheme(s.id)}>
                    <span className={`swatch eva-${s.id}`} /> {s.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="label">Свой фон</div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={bg.enabled}
              onChange={(e) => setBg({ enabled: e.target.checked })}
              disabled={bg.source === "url" ? !bg.url.trim() : bg.version === 0}
            />
            показывать
          </label>
          <div className="view-row">
            <button onClick={() => file.current?.click()} disabled={busy}>
              {busy ? "Загрузка…" : "Загрузить картинку"}
            </button>
            {bg.source === "upload" && bg.version > 0 && (
              <button className="danger" onClick={removeUpload}>
                Удалить
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          <input
            className="view-url"
            placeholder="…или ссылка на картинку"
            value={bg.source === "url" ? bg.url : ""}
            onChange={(e) => setBg({ source: "url", url: e.target.value, enabled: !!e.target.value.trim() })}
          />
          <label className="view-slider">
            Прозрачность фона: {Math.round(bg.opacity * 100)}%
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(bg.opacity * 100)}
              onChange={(e) => setBg({ opacity: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="view-slider">
            Размытие: {bg.blur}px
            <input type="range" min={0} max={20} value={bg.blur} onChange={(e) => setBg({ blur: Number(e.target.value) })} />
          </label>
          <div className="view-themes">
            {(["cover", "contain", "tile"] as const).map((f) => (
              <button key={f} className={bg.fit === f ? "active" : ""} onClick={() => setBg({ fit: f })}>
                {f === "cover" ? "заполнить" : f === "contain" ? "целиком" : "плиткой"}
              </button>
            ))}
          </div>
          {error && <div className="error-line small">{error}</div>}
          <div className="muted small">
            Картинка хранится в <code>data/</code> на сервере и в git не попадает.
          </div>
        </div>
      )}
    </div>
  );
}

/** Слой фона под интерфейсом. */
export function BackgroundLayer({ bg }: { bg: Background }) {
  const src = backgroundSrc(bg);
  if (!src) return null;
  const size = bg.fit === "tile" ? "auto" : bg.fit;
  return (
    <div
      className="bg-layer"
      aria-hidden
      style={{
        backgroundImage: `url("${src.replace(/"/g, "%22")}")`,
        backgroundSize: size,
        backgroundRepeat: bg.fit === "tile" ? "repeat" : "no-repeat",
        opacity: bg.opacity,
        filter: bg.blur ? `blur(${bg.blur}px)` : undefined,
      }}
    />
  );
}
