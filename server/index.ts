import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { basicAuth } from "hono/basic-auth";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "./db.ts";
import { getRun, startChatRun, stopRun } from "./runner.ts";
import { adapterFor } from "./providers/index.ts";
import { PROVIDER_KINDS } from "../shared/providers.ts";
import { generateTheme } from "./themegen.ts";
import { fetchFun, getGiphyKey, setGiphyKey, type FunSource } from "./fun.ts";
import type { RunEvent } from "../shared/types.ts";

const app = new Hono();

// Если сервер открыт в сеть лаборатории — задай пароль: AI_HUB_PASSWORD=...
if (process.env.AI_HUB_PASSWORD) {
  app.use(
    "*",
    basicAuth({ username: process.env.AI_HUB_USER ?? "admin", password: process.env.AI_HUB_PASSWORD }),
  );
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 400);
});

const api = new Hono();

// ---------- providers ----------
api.get("/providers", (c) => c.json(db.listProviders().map(db.publicProvider)));
api.post("/providers", async (c) => {
  const b = await c.req.json();
  if (!b.name || !(b.kind in PROVIDER_KINDS)) throw new Error("Нужны name и корректный kind");
  return c.json(db.publicProvider(db.createProvider(b)));
});
api.put("/providers/:id", async (c) => {
  const p = db.updateProvider(c.req.param("id"), await c.req.json());
  return p ? c.json(db.publicProvider(p)) : c.json({ error: "not found" }, 404);
});
api.delete("/providers/:id", (c) => {
  db.deleteProvider(c.req.param("id"));
  return c.json({ ok: true });
});
api.get("/providers/:id/models", async (c) => {
  const p = db.getProvider(c.req.param("id"));
  if (!p) return c.json({ error: "not found" }, 404);
  const adapter = adapterFor(p.kind);
  try {
    return c.json({ models: await adapter.listModels(p) });
  } catch (e) {
    // Нет сети / ключа — хотя бы известный список.
    return c.json({ models: adapter.fallbackModels, error: e instanceof Error ? e.message : String(e) });
  }
});

// ---------- agents ----------
api.get("/agents", (c) => c.json(db.listAgents()));
api.post("/agents", async (c) => {
  const b = await c.req.json();
  if (!b.name || !b.provider_id || !b.model) throw new Error("Нужны name, provider_id, model");
  return c.json(db.createAgent(b));
});
api.put("/agents/:id", async (c) => {
  const a = db.updateAgent(c.req.param("id"), await c.req.json());
  return a ? c.json(a) : c.json({ error: "not found" }, 404);
});
api.delete("/agents/:id", (c) => {
  db.deleteAgent(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- office: связи и правила ----------
api.get("/links", (c) => c.json(db.listLinks()));
api.post("/links", async (c) => {
  const { from_agent, to_agent, kind } = await c.req.json();
  return c.json(db.createLink(from_agent, to_agent, kind));
});
api.patch("/links/:id", async (c) => {
  const l = db.updateLink(c.req.param("id"), await c.req.json());
  return l ? c.json(l) : c.json({ error: "not found" }, 404);
});
api.delete("/links/:id", (c) => {
  db.deleteLink(c.req.param("id"));
  return c.json({ ok: true });
});
api.get("/settings", (c) => c.json(db.getSettings()));
api.put("/settings", async (c) => {
  const b = await c.req.json();
  if (b.max_depth !== undefined && !(Number.isInteger(b.max_depth) && b.max_depth >= 1 && b.max_depth <= 10)) {
    throw new Error("max_depth: целое от 1 до 10");
  }
  return c.json(db.updateSettings(b));
});

// ---------- пользовательские темы ----------
api.get("/themes", (c) => c.json(db.listThemes()));
api.post("/themes", async (c) => c.json(db.saveTheme(await c.req.json())));
api.put("/themes/:id", async (c) => c.json(db.saveTheme(await c.req.json(), c.req.param("id"))));
api.delete("/themes/:id", (c) => {
  db.deleteTheme(c.req.param("id"));
  return c.json({ ok: true });
});
api.post("/themes/generate", async (c) => {
  const { agent_id, description } = await c.req.json();
  if (typeof description !== "string" || !description.trim()) throw new Error("Опиши, какую тему хочешь");
  return c.json(await generateTheme(String(agent_id), description.trim()));
});

// ---------- свой фон (хранится в data/, в git не попадает) ----------
const BG_FILE = join(dirname(db.DB_PATH), "background");
const BG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];
const BG_MAX = 15 * 1024 * 1024;

api.get("/background", (c) => {
  const mime = db.getSetting("background_mime");
  if (!mime || !existsSync(BG_FILE)) return c.json({ error: "нет фона" }, 404);
  return c.body(readFileSync(BG_FILE), 200, { "Content-Type": mime, "Cache-Control": "no-cache" });
});
api.put("/background", async (c) => {
  const mime = (c.req.header("content-type") ?? "").split(";")[0].trim();
  if (!BG_TYPES.includes(mime)) throw new Error("Нужна картинка: png, jpg, gif, webp или avif");
  const buf = Buffer.from(await c.req.arrayBuffer());
  if (!buf.length) throw new Error("Пустой файл");
  if (buf.length > BG_MAX) throw new Error("Файл больше 15 МБ");
  writeFileSync(BG_FILE, buf);
  db.setSetting("background_mime", mime);
  return c.json({ ok: true });
});
api.delete("/background", (c) => {
  if (existsSync(BG_FILE)) unlinkSync(BG_FILE);
  db.setSetting("background_mime", null);
  return c.json({ ok: true });
});

// ---------- отвлекалово ----------
api.get("/fun/random", async (c) => {
  const source = (c.req.query("source") ?? "memes") as FunSource;
  if (!["memes", "gifs", "giphy"].includes(source)) throw new Error("Неизвестный источник");
  try {
    return c.json({ items: await fetchFun(source) });
  } catch (e) {
    return c.json({ items: [], error: e instanceof Error ? e.message : String(e) });
  }
});
api.get("/fun/config", (c) => c.json({ giphy: !!getGiphyKey() }));
api.put("/fun/giphy-key", async (c) => {
  const { key } = await c.req.json();
  setGiphyKey(typeof key === "string" && key.trim() ? key.trim() : null);
  return c.json({ giphy: !!getGiphyKey() });
});
api.get("/fun", (c) => c.json(db.listFun()));
api.post("/fun", async (c) => {
  const { url, title } = await c.req.json();
  if (typeof url !== "string") throw new Error("Нужна ссылка");
  return c.json(db.addFun(url.trim(), typeof title === "string" ? title : ""));
});
api.delete("/fun/:id", (c) => {
  db.deleteFun(c.req.param("id"));
  return c.json({ ok: true });
});

// ---------- chats ----------
api.get("/chats", (c) => c.json(db.listChats()));
api.post("/chats", async (c) => {
  const { agent_id } = await c.req.json();
  if (!db.getAgent(agent_id)) throw new Error("Агент не найден");
  return c.json(db.createChat(agent_id));
});
api.patch("/chats/:id", async (c) => {
  const ch = db.updateChat(c.req.param("id"), await c.req.json());
  return ch ? c.json(ch) : c.json({ error: "not found" }, 404);
});
api.delete("/chats/:id", (c) => {
  stopRun(c.req.param("id"));
  db.deleteChat(c.req.param("id"));
  return c.json({ ok: true });
});
api.get("/chats/:id/messages", (c) =>
  c.json({
    messages: db.listMessages(c.req.param("id")).map(db.publicMessage),
    running: !!getRun(c.req.param("id")),
  }),
);
api.post("/chats/:id/send", async (c) => {
  const { text } = await c.req.json();
  if (typeof text !== "string" || !text.trim()) throw new Error("Пустое сообщение");
  const m = startChatRun(c.req.param("id"), text);
  return c.json({ message_id: m.id });
});
api.post("/chats/:id/stop", (c) => {
  stopRun(c.req.param("id"));
  return c.json({ ok: true });
});

// Поток событий текущего хода. Можно переподключиться — события отдаются с начала.
api.get("/chats/:id/events", (c) => {
  const run = getRun(c.req.param("id"));
  return streamSSE(c, async (stream) => {
    if (!run) {
      await stream.writeSSE({ event: "idle", data: "{}" });
      return;
    }
    const queue: RunEvent[] = [...run.events];
    let wake: (() => void) | null = null;
    const sub = (ev: RunEvent) => {
      queue.push(ev);
      wake?.();
    };
    run.subscribers.add(sub);
    stream.onAbort(() => {
      run.subscribers.delete(sub);
      wake?.();
    });
    try {
      while (!stream.aborted) {
        while (queue.length) {
          const ev = queue.shift()!;
          await stream.writeSSE({ data: JSON.stringify(ev) });
          if (ev.type === "done") return;
        }
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    } finally {
      run.subscribers.delete(sub);
    }
  });
});

app.route("/api", api);

// ---------- статика (после `npm run build`) ----------
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: dist }));
  app.get("*", serveStatic({ path: join(dist, "index.html") }));
}

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`AI Hub API: http://${hostname}:${port}`);
  if (hostname !== "127.0.0.1" && !process.env.AI_HUB_PASSWORD) {
    console.warn("ВНИМАНИЕ: сервер открыт в сеть без пароля. Задай AI_HUB_PASSWORD.");
  }
});
