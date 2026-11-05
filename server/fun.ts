// Автоматическая лента мемов и гифок для панели «отвлекалова».
// Запросы идут с сервера: нет проблем с CORS, ключ GIPHY не попадает в браузер.
import { db } from "./db.ts";

export interface FunMedia {
  id: string;
  url: string; // прямая ссылка на картинку/гифку
  title: string;
  link: string; // откуда взято
  source: string;
}

export type FunSource = "memes" | "gifs" | "giphy";

const MEME_SUBS = ["ProgrammerHumor", "linuxmemes", "softwaregore", "programmingmemes", "techhumor"];
const GIF_SUBS = ["reactiongifs"];
const GIPHY_QUERIES = [
  "programming", "coding", "hacker", "computer fail", "keyboard smash", "cat typing",
  "it crowd", "bug", "deploy", "server fire", "retro computer", "glitch", "terminal", "this is fine",
];

const IMAGE_RE = /\.(gif|png|jpe?g|webp)$/i;

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, {
    headers: { "User-Agent": "ai-hub/0.1 (local)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${new URL(url).hostname}: HTTP ${r.status}`);
  return r.json();
}

interface MemeApiResponse {
  memes?: { postLink: string; subreddit: string; title: string; url: string; nsfw: boolean; spoiler: boolean }[];
}

/** meme-api.com — свежие посты Reddit, ключ не нужен. */
async function fromReddit(subs: string[], count: number): Promise<FunMedia[]> {
  const sub = pick(subs);
  const j = (await getJson(`https://meme-api.com/gimme/${sub}/${Math.min(50, count * 2)}`)) as MemeApiResponse;
  return (j.memes ?? [])
    .filter((m) => !m.nsfw && !m.spoiler && IMAGE_RE.test(new URL(m.url).pathname))
    .map((m) => ({ id: m.postLink, url: m.url, title: m.title, link: m.postLink, source: `r/${m.subreddit}` }));
}

interface GiphyResponse {
  data?: {
    id: string;
    title: string;
    url: string;
    images: { original?: { url?: string }; downsized_medium?: { url?: string } };
  }[];
  meta?: { status: number; msg: string };
}

async function fromGiphy(count: number): Promise<FunMedia[]> {
  const key = getGiphyKey();
  if (!key) throw new Error("Нет ключа GIPHY");
  const q = pick(GIPHY_QUERIES);
  const params = new URLSearchParams({
    api_key: key,
    q,
    limit: String(Math.min(50, count)),
    offset: String(Math.floor(Math.random() * 100)),
    rating: "pg", // без взрослого контента
  });
  const j = (await getJson(`https://api.giphy.com/v1/gifs/search?${params}`)) as GiphyResponse;
  return (j.data ?? [])
    .map((g) => ({
      id: g.id,
      url: g.images.downsized_medium?.url || g.images.original?.url || "",
      title: g.title || q,
      link: g.url,
      source: "GIPHY",
    }))
    .filter((g) => g.url);
}

export async function fetchFun(source: FunSource, count = 12): Promise<FunMedia[]> {
  const items =
    source === "giphy" ? await fromGiphy(count) : await fromReddit(source === "gifs" ? GIF_SUBS : MEME_SUBS, count);
  // перемешиваем, чтобы не идти строго по «горячему»
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count);
}

// ---------- ключ GIPHY (хранится в settings, наружу не отдаётся) ----------

export function getGiphyKey(): string | null {
  const r = db.prepare("SELECT value FROM settings WHERE key = 'giphy_key'").get() as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as string) : process.env.GIPHY_API_KEY || null;
}

export function setGiphyKey(key: string | null) {
  if (!key) db.prepare("DELETE FROM settings WHERE key = 'giphy_key'").run();
  else
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('giphy_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(JSON.stringify(key));
}
