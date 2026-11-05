import { useEffect, useRef, useState } from "react";
import { api, type FunItem, type FunMedia } from "../api.ts";
import { BugGame, EGA, ReactionGame, SnakeGame } from "./games.tsx";

type Tab = "games" | "feed" | "chaos";

export function FunPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem("fun-tab") as Tab) || "games";
    } catch {
      return "games";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("fun-tab", tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  return (
    <aside className="fun" data-title="ОТВЛЕКАЛОВО">
      <div className="fun-tabs">
        <button className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}>
          Игры
        </button>
        <button className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}>
          Гифки
        </button>
        <button className={tab === "chaos" ? "active" : ""} onClick={() => setTab("chaos")}>
          Хаос
        </button>
        <button className="icon fun-close" title="Скрыть" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="fun-body">
        {tab === "games" && <Games />}
        {tab === "feed" && <Feed />}
        {tab === "chaos" && <Chaos />}
      </div>
      <Ticker />
    </aside>
  );
}

// ---------------------------------------------------------------------------

function Games() {
  const [g, setG] = useState<"snake" | "bugs" | "reaction">("snake");
  return (
    <>
      <div className="fun-sub">
        <button className={g === "snake" ? "active" : ""} onClick={() => setG("snake")}>
          Питон
        </button>
        <button className={g === "bugs" ? "active" : ""} onClick={() => setG("bugs")}>
          Баги
        </button>
        <button className={g === "reaction" ? "active" : ""} onClick={() => setG("reaction")}>
          Реакция
        </button>
      </div>
      {g === "snake" && <SnakeGame />}
      {g === "bugs" && <BugGame />}
      {g === "reaction" && <ReactionGame />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Разбор пользовательских ссылок: TikTok, YouTube, картинки, видео.
// ---------------------------------------------------------------------------

type Embed =
  | { kind: "tiktok"; src: string }
  | { kind: "youtube"; src: string }
  | { kind: "image"; src: string }
  | { kind: "video"; src: string }
  | { kind: "link"; src: string };

function toEmbed(raw: string): Embed {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: "link", src: raw };
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host.endsWith("tiktok.com")) {
    const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
    if (id) return { kind: "tiktok", src: `https://www.tiktok.com/embed/v2/${id}` };
  }
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : (u.searchParams.get("v") ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]);
    if (id) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  const path = u.pathname.toLowerCase();
  if (/\.(gif|png|jpe?g|webp|avif|svg)$/.test(path) || host.endsWith("giphy.com") && path.includes("/media/")) {
    return { kind: "image", src: u.toString() };
  }
  if (/\.(mp4|webm|mov|ogg)$/.test(path)) return { kind: "video", src: u.toString() };
  return { kind: "link", src: u.toString() };
}

function MediaView({ item, large = false }: { item: FunItem; large?: boolean }) {
  const e = toEmbed(item.url);
  const cls = large ? "large" : "";
  switch (e.kind) {
    case "tiktok":
      return (
        <iframe
          className={`media tiktok ${cls}`}
          src={e.src}
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title={item.title || "TikTok"}
        />
      );
    case "youtube":
      return (
        <iframe
          className={`media youtube ${cls}`}
          src={e.src + (large ? "?autoplay=1" : "")}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title={item.title || "YouTube"}
        />
      );
    case "image":
      return <img className={`media ${cls}`} src={e.src} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />;
    case "video":
      return <video className={`media ${cls}`} src={e.src} controls loop muted={!large} autoPlay={large} playsInline />;
    default:
      return (
        <a className="media-link" href={e.src} target="_blank" rel="noreferrer noopener">
          ↗ {item.title || e.src}
        </a>
      );
  }
}

/** Полноэкранный просмотр поверх всего сайта. Esc или клик мимо — закрыть. */
function Lightbox({ children, caption, onClose }: { children: React.ReactNode; caption?: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-win" data-title="ПРОСМОТР" onClick={(e) => e.stopPropagation()}>
        <button className="icon lightbox-close" onClick={onClose} title="Закрыть (Esc)">
          ×
        </button>
        <div className="lightbox-body">{children}</div>
        {caption && <div className="lightbox-caption">{caption}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Гифки: автоматическая лента (Reddit через meme-api.com, GIPHY по ключу) + свои ссылки.
// ---------------------------------------------------------------------------

type AutoSource = "memes" | "gifs" | "giphy";

const SOURCE_LABEL: Record<AutoSource, string> = { memes: "Мемы", gifs: "Гифки", giphy: "GIPHY" };

function load<T extends string>(key: string, def: T): T {
  try {
    return (localStorage.getItem(key) as T) || def;
  } catch {
    return def;
  }
}
function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

function Feed() {
  const [mode, setMode] = useState<"auto" | "mine">(() => load("fun-feed-mode", "auto"));
  useEffect(() => save("fun-feed-mode", mode), [mode]);
  return (
    <div className="feed">
      <div className="fun-sub">
        <button className={mode === "auto" ? "active" : ""} onClick={() => setMode("auto")}>
          Авто
        </button>
        <button className={mode === "mine" ? "active" : ""} onClick={() => setMode("mine")}>
          Мои ссылки
        </button>
      </div>
      {mode === "auto" ? <AutoFeed /> : <MyLinks />}
    </div>
  );
}

function AutoFeed() {
  const [source, setSource] = useState<AutoSource>(() => load("fun-source", "memes"));
  const [queue, setQueue] = useState<FunMedia[]>([]);
  const [history, setHistory] = useState<FunMedia[]>([]); // history[0] — текущая
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(() => load("fun-auto", "1") === "1");
  const [big, setBig] = useState(false);
  const [giphy, setGiphy] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const queueRef = useRef<FunMedia[]>([]);
  const setQ = (q: FunMedia[]) => {
    queueRef.current = q;
    setQueue(q);
  };

  const sourceRef = useRef(source);
  sourceRef.current = source;
  useEffect(() => save("fun-source", source), [source]);
  useEffect(() => save("fun-auto", auto ? "1" : "0"), [auto]);
  useEffect(() => {
    api.funConfig().then((c) => setGiphy(c.giphy));
  }, []);

  const refill = async (src: AutoSource) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const r = await api.funRandom(src);
      if (r.error) setError(r.error);
      else setError(null);
      const queued = new Set(queueRef.current.map((x) => x.id));
      const fresh = r.items.filter((x) => !seen.current.has(x.id) && !queued.has(x.id));
      fresh.forEach((x) => {
        const img = new Image(); // прогреваем кэш браузера
        img.referrerPolicy = "no-referrer";
        img.src = x.url;
      });
      if (src === sourceRef.current) setQ([...queueRef.current, ...fresh]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
      // источник сменили, пока грузились, — грузим для нового
      if (src !== sourceRef.current && sourceRef.current !== "giphy") refill(sourceRef.current);
    }
  };

  // смена источника — сбрасываем очередь
  useEffect(() => {
    if (source === "giphy" && !giphy) return;
    setQ([]);
    setHistory([]);
    refill(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, giphy]);

  // первая картинка, как только очередь наполнилась
  useEffect(() => {
    if (!history.length && queue.length) next();
    if (queue.length < 4 && !busy.current && (source !== "giphy" || giphy)) refill(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const next = () => {
    const [head, ...rest] = queueRef.current;
    if (!head) return;
    seen.current.add(head.id);
    setQ(rest);
    setHistory((h) => [head, ...h].slice(0, 30));
  };
  const prev = () => setHistory((h) => (h.length > 1 ? h.slice(1) : h));

  // автопролистывание (на паузе, пока открыт полноэкранный просмотр)
  useEffect(() => {
    if (!auto || big) return;
    const t = setInterval(next, 12000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, big, history.length]);

  const cur = history[0];

  const saveKey = async () => {
    const r = await api.setGiphyKey(keyInput.trim() || null);
    setGiphy(r.giphy);
    setKeyInput("");
  };

  return (
    <>
      <div className="fun-sub">
        {(Object.keys(SOURCE_LABEL) as AutoSource[]).map((s) => (
          <button key={s} className={source === s ? "active" : ""} onClick={() => setSource(s)}>
            {SOURCE_LABEL[s]}
          </button>
        ))}
      </div>

      {source === "giphy" && !giphy ? (
        <div className="giphy-key">
          <p className="small">
            Для GIPHY нужен бесплатный ключ: зайди на <b>developers.giphy.com</b> → Create an App → API → скопируй API
            Key.
          </p>
          <input value={keyInput} placeholder="GIPHY API key" onChange={(e) => setKeyInput(e.target.value)} />
          <button className="primary" onClick={saveKey} disabled={!keyInput.trim()}>
            Сохранить ключ
          </button>
          <p className="muted small">А пока можно смотреть «Мемы» и «Гифки» — им ключ не нужен.</p>
        </div>
      ) : (
        <>
          <div className="auto-view" onClick={() => cur && setBig(true)} title="Кликни — откроется на весь экран">
            {cur ? (
              <img key={cur.id} src={cur.url} alt={cur.title} referrerPolicy="no-referrer" />
            ) : (
              <div className="auto-empty">{loading ? "ЗАГРУЗКА…" : error ?? "пусто"}</div>
            )}
          </div>
          {cur && (
            <div className="auto-caption">
              <div className="auto-title">{cur.title}</div>
              <a className="muted small" href={cur.link} target="_blank" rel="noreferrer noopener">
                {cur.source} ↗
              </a>
            </div>
          )}
          <div className="auto-controls">
            <button onClick={prev} disabled={history.length < 2}>
              ◀
            </button>
            <button className="primary" onClick={next} disabled={!queue.length}>
              Ещё ▶
            </button>
            <button className={auto ? "active" : ""} onClick={() => setAuto((a) => !a)} title="Листать каждые 12 секунд">
              Авто:{auto ? "ВКЛ" : "ВЫКЛ"}
            </button>
          </div>
          {error && cur && <div className="error-line small">{error}</div>}
          {source === "giphy" && (
            <div className="muted small giphy-foot">
              Powered by GIPHY ·{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); api.setGiphyKey(null).then((r) => setGiphy(r.giphy)); }}>
                сбросить ключ
              </a>
            </div>
          )}
        </>
      )}

      {big && cur && (
        <Lightbox
          onClose={() => setBig(false)}
          caption={
            <>
              <span>{cur.title}</span>
              <span className="lightbox-nav">
                <button onClick={prev} disabled={history.length < 2}>◀</button>
                <button className="primary" onClick={next} disabled={!queue.length}>Ещё ▶</button>
              </span>
            </>
          }
        >
          <img className="lightbox-img" src={cur.url} alt={cur.title} referrerPolicy="no-referrer" />
        </Lightbox>
      )}
    </>
  );
}

function MyLinks() {
  const [items, setItems] = useState<FunItem[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<FunItem | null>(null);

  useEffect(() => {
    api.fun().then(setItems);
  }, []);

  const add = async () => {
    setError(null);
    try {
      const it = await api.addFun(url.trim(), title.trim());
      setItems((xs) => [it, ...xs]);
      setUrl("");
      setTitle("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    await api.deleteFun(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  };

  return (
    <>
      <div className="feed-add">
        <input
          value={url}
          placeholder="ссылка: YouTube, TikTok, .gif, .mp4…"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && add()}
        />
        <input value={title} placeholder="подпись (необязательно)" onChange={(e) => setTitle(e.target.value)} />
        <button className="primary" onClick={add} disabled={!url.trim()}>
          Добавить
        </button>
        {error && <div className="error-line">{error}</div>}
      </div>
      {items.length === 0 && <p className="muted small">Здесь будут твои ссылки. Видео лучше смотреть через ⛶ — откроется большим окном.</p>}
      {items.map((it) => (
        <div key={it.id} className="feed-item">
          <MediaView item={it} />
          <div className="feed-caption">
            <span>{it.title}</span>
            <span>
              <button className="icon" title="Развернуть" onClick={() => setOpen(it)}>
                ⛶
              </button>
              <button className="icon" title="Убрать" onClick={() => remove(it.id)}>
                ×
              </button>
            </span>
          </div>
        </div>
      ))}
      {open && (
        <Lightbox onClose={() => setOpen(null)} caption={open.title || undefined}>
          <MediaView item={open} large />
        </Lightbox>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Хаос: логотип отскакивает от стенок, меняет цвет. Попадание в угол — праздник.
// ---------------------------------------------------------------------------

function Chaos() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [corners, setCorners] = useState(0);
  const [party, setParty] = useState(false);
  const [joke, setJoke] = useState(() => JOKES[Math.floor(Math.random() * JOKES.length)]);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const W = c.width;
    const H = c.height;
    const text = "AI·HUB";
    ctx.font = "16px 'Press Start 2P', monospace";
    const tw = ctx.measureText(text).width + 16;
    const th = 30;
    let x = 20, y = 30, vx = 1.6, vy = 1.2, color = 9, raf = 0;
    const colors = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14];
    const frame = () => {
      x += vx;
      y += vy;
      let hitX = false, hitY = false;
      if (x <= 0 || x + tw >= W) { vx = -vx; x = Math.max(0, Math.min(x, W - tw)); hitX = true; }
      if (y <= 0 || y + th >= H) { vy = -vy; y = Math.max(0, Math.min(y, H - th)); hitY = true; }
      if (hitX || hitY) color = colors[(colors.indexOf(color) + 1) % colors.length];
      if (hitX && hitY) {
        setCorners((n) => n + 1);
        setParty(true);
        setTimeout(() => setParty(false), 1500);
      }
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = EGA[color];
      ctx.fillRect(x, y, tw, th);
      ctx.fillStyle = "#000000";
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.fillText(text, x + 8, y + 23);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="chaos">
      <div className="game-head">
        <b>ЗАСТАВКА</b>
        <span>в угол: {corners}</span>
      </div>
      <div className={`game-screen ${party ? "party" : ""}`}>
        <canvas ref={canvas} width={288} height={200} />
        {party && <div className="party-text blink">ПОПАЛ В УГОЛ!!!</div>}
      </div>
      <div className="joke">
        <div className="label">fortune.exe</div>
        <div className="joke-text">{joke}</div>
        <button onClick={() => setJoke(JOKES[Math.floor(Math.random() * JOKES.length)])}>Ещё</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Бегущая строка внизу панели.
// ---------------------------------------------------------------------------

function Ticker() {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  // Скорость постоянная: длинный факт едет дольше. Следующий — когда текущий уехал.
  const seconds = Math.max(10, FACTS[i].length * 0.22);
  return (
    <div className="ticker" title="Факты про TempleOS">
      <span
        key={i}
        style={{ animationDuration: `${seconds}s` }}
        onAnimationEnd={() => setI((n) => (n + 1) % FACTS.length)}
      >
        {FACTS[i]}
      </span>
    </div>
  );
}

const FACTS = [
  "TempleOS работает в 640×480 и ровно 16 цветах — как этот сайт.",
  "Всё в TempleOS написано на HolyC — собственном диалекте C.",
  "Командная строка TempleOS — это интерпретатор HolyC: вводишь код, он сразу выполняется.",
  "В TempleOS нет сети. Совсем. Отвлекаться было не на что.",
  "Весь код в TempleOS работает в ring 0 — без защиты памяти между программами.",
  "Документы, код и картинки в TempleOS живут в одном формате DolDoc.",
  "Автор TempleOS держал систему в пределах примерно 100 000 строк кода.",
];

const JOKES = [
  "Руководитель поручил задачу Исполнителю. Исполнитель спросил Ревьюера. Ревьюер спросил, кто вообще всё это начал.",
  "Мой код скомпилировался с первого раза. Теперь я боюсь его запускать.",
  "Есть 10 типов людей: те, кто понимает двоичную систему, и те, кто нет.",
  "Агентов стало пятеро, задач по-прежнему одна. Зато совещание продуктивное.",
  "— Почему нейросеть так долго думает? — Effort: max.",
  "Не баг, а незадокументированная фича.",
  "Работает — не трогай. Не работает — поручи агенту.",
  "В ring 0 нет ограничений. Как и в моих дедлайнах.",
  "Сказал модели «будь краток». Получил три абзаца о краткости.",
  "640×480 хватит всем.",
  "Токенов потрачено: много. Задача решена: почти.",
  "Ревьюер нашёл 0 замечаний. Ревьюер, ты там жив?",
  "Самый надёжный способ найти баг — показать код кому-то ещё.",
  "Глубина цепочки: 3. Глубина моей прокрастинации: да.",
  "Кэш инвалидирован. Как и мой план на вечер.",
];
