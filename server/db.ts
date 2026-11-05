import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { sanitizeTheme, type CustomTheme } from "../shared/themes.ts";
import type { Agent, Chat, Link, LinkKind, Message, OfficeSettings, Provider, ProviderKind } from "../shared/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.AI_HUB_DB ?? join(here, "..", "data", "ai-hub.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT,
  api_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  effort TEXT,
  temperature REAL,
  max_tokens INTEGER,
  color TEXT NOT NULL DEFAULT '#7aa2f7',
  x REAL,
  y REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  parts TEXT NOT NULL DEFAULT '[]',
  -- Сообщения в родном формате провайдера (для точного воспроизведения истории)
  raw TEXT,
  raw_kind TEXT,
  agent_id TEXT,
  model TEXT,
  usage TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, created_at);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  from_agent TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (from_agent, to_agent, kind)
);
CREATE TABLE IF NOT EXISTS custom_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base TEXT NOT NULL,
  vars TEXT NOT NULL DEFAULT '{}',
  css TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fun_items (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---------- миграции ----------
{
  const cols = (db.prepare("PRAGMA table_info(agents)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("x")) db.exec("ALTER TABLE agents ADD COLUMN x REAL; ALTER TABLE agents ADD COLUMN y REAL;");
  if (cols.includes("subordinates")) {
    // v0.1 хранил подчинённых списком в агенте — переносим в links.
    const rows = db.prepare("SELECT id, subordinates FROM agents").all() as { id: string; subordinates: string }[];
    const ins = db.prepare(
      "INSERT OR IGNORE INTO links (id, from_agent, to_agent, kind, created_at) VALUES (?, ?, ?, 'manages', ?)",
    );
    for (const r of rows) {
      for (const sub of JSON.parse(r.subordinates || "[]") as string[]) {
        ins.run(randomUUID(), r.id, sub, new Date().toISOString());
      }
    }
    db.exec("ALTER TABLE agents DROP COLUMN subordinates");
  }
}

// Сообщения, оставшиеся «в процессе» после падения сервера.
db.exec(`UPDATE messages SET status = 'stopped', raw = NULL WHERE status = 'streaming'`);

const now = () => new Date().toISOString();
export const newId = () => randomUUID();

type Row = Record<string, unknown>;

// ---------- providers ----------

export interface ProviderRow extends Omit<Provider, "has_key"> {
  api_key: string | null;
}

function toProvider(r: Row): ProviderRow {
  return r as unknown as ProviderRow;
}

export function publicProvider(p: ProviderRow): Provider {
  const { api_key, ...rest } = p;
  return { ...rest, has_key: !!api_key };
}

export function listProviders(): ProviderRow[] {
  return db.prepare("SELECT * FROM providers ORDER BY created_at").all().map(toProvider);
}

export function getProvider(id: string): ProviderRow | undefined {
  const r = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
  return r ? toProvider(r) : undefined;
}

export function createProvider(p: {
  name: string;
  kind: ProviderKind;
  base_url?: string | null;
  api_key?: string | null;
}): ProviderRow {
  const id = newId();
  db.prepare(
    "INSERT INTO providers (id, name, kind, base_url, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, p.name, p.kind, p.base_url || null, p.api_key || null, now());
  return getProvider(id)!;
}

export function updateProvider(
  id: string,
  p: { name?: string; base_url?: string | null; api_key?: string | null },
): ProviderRow | undefined {
  const cur = getProvider(id);
  if (!cur) return undefined;
  db.prepare("UPDATE providers SET name = ?, base_url = ?, api_key = ? WHERE id = ?").run(
    p.name ?? cur.name,
    p.base_url !== undefined ? p.base_url || null : cur.base_url,
    // Пустая строка/undefined — ключ не трогаем; null — удалить ключ.
    p.api_key === null ? null : p.api_key ? p.api_key : cur.api_key,
    id,
  );
  return getProvider(id);
}

export function deleteProvider(id: string) {
  db.prepare("DELETE FROM providers WHERE id = ?").run(id);
}

// ---------- agents ----------

function toAgent(r: Row): Agent {
  return r as unknown as Agent;
}

export function listAgents(): Agent[] {
  return db.prepare("SELECT * FROM agents ORDER BY created_at").all().map(toAgent);
}

export function getAgent(id: string): Agent | undefined {
  const r = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  return r ? toAgent(r) : undefined;
}

type AgentInput = Omit<Agent, "id" | "created_at">;

export function createAgent(a: AgentInput): Agent {
  const id = newId();
  db.prepare(
    `INSERT INTO agents (id, name, description, provider_id, model, system_prompt, effort, temperature,
       max_tokens, color, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    a.name,
    a.description ?? "",
    a.provider_id,
    a.model,
    a.system_prompt ?? "",
    a.effort ?? null,
    a.temperature ?? null,
    a.max_tokens ?? null,
    a.color ?? "#7aa2f7",
    a.x ?? null,
    a.y ?? null,
    now(),
  );
  return getAgent(id)!;
}

export function updateAgent(id: string, a: Partial<AgentInput>): Agent | undefined {
  const cur = getAgent(id);
  if (!cur) return undefined;
  const m = { ...cur, ...a };
  db.prepare(
    `UPDATE agents SET name = ?, description = ?, provider_id = ?, model = ?, system_prompt = ?, effort = ?,
       temperature = ?, max_tokens = ?, color = ?, x = ?, y = ? WHERE id = ?`,
  ).run(
    m.name,
    m.description,
    m.provider_id,
    m.model,
    m.system_prompt,
    m.effort ?? null,
    m.temperature ?? null,
    m.max_tokens ?? null,
    m.color,
    m.x ?? null,
    m.y ?? null,
    id,
  );
  return getAgent(id);
}

export function deleteAgent(id: string) {
  db.prepare("DELETE FROM agents WHERE id = ?").run(id); // связи удалятся каскадно
}

// ---------- links (оргструктура офиса) ----------

export function listLinks(): Link[] {
  return db.prepare("SELECT * FROM links ORDER BY created_at").all() as unknown as Link[];
}

export function createLink(from_agent: string, to_agent: string, kind: LinkKind): Link {
  if (from_agent === to_agent) throw new Error("Нельзя связать агента с самим собой");
  if (kind !== "manages" && kind !== "consults") throw new Error("Неизвестный тип связи");
  if (!getAgent(from_agent) || !getAgent(to_agent)) throw new Error("Агент не найден");
  // Не допускаем дублей: обратное «коллеги» — та же связь; «руководит» и «коллеги» между одной парой — заменяем.
  db.prepare(
    "DELETE FROM links WHERE (from_agent = ? AND to_agent = ?) OR (from_agent = ? AND to_agent = ?)",
  ).run(from_agent, to_agent, to_agent, from_agent);
  const id = newId();
  db.prepare("INSERT INTO links (id, from_agent, to_agent, kind, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    from_agent,
    to_agent,
    kind,
    now(),
  );
  return db.prepare("SELECT * FROM links WHERE id = ?").get(id) as unknown as Link;
}

export function updateLink(id: string, l: { kind?: LinkKind; reverse?: boolean }): Link | undefined {
  const cur = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as unknown as Link | undefined;
  if (!cur) return undefined;
  const from = l.reverse ? cur.to_agent : cur.from_agent;
  const to = l.reverse ? cur.from_agent : cur.to_agent;
  return createLink(from, to, l.kind ?? cur.kind);
}

export function deleteLink(id: string) {
  db.prepare("DELETE FROM links WHERE id = ?").run(id);
}

// ---------- settings ----------

const DEFAULT_SETTINGS: OfficeSettings = { max_depth: 3 };

export function getSettings(): OfficeSettings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  return s as unknown as OfficeSettings;
}

export function updateSettings(patch: Partial<OfficeSettings>): OfficeSettings {
  const up = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) up.run(k, JSON.stringify(v));
  }
  return getSettings();
}

// ---------- chats ----------

export function listChats(): Chat[] {
  return db.prepare("SELECT * FROM chats ORDER BY updated_at DESC").all() as unknown as Chat[];
}

export function getChat(id: string): Chat | undefined {
  return db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as unknown as Chat | undefined;
}

export function createChat(agent_id: string, title = "Новый чат"): Chat {
  const id = newId();
  const t = now();
  db.prepare(
    "INSERT INTO chats (id, title, agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, title, agent_id, t, t);
  return getChat(id)!;
}

export function updateChat(id: string, c: { title?: string; agent_id?: string }) {
  const cur = getChat(id);
  if (!cur) return undefined;
  db.prepare("UPDATE chats SET title = ?, agent_id = ?, updated_at = ? WHERE id = ?").run(
    c.title ?? cur.title,
    c.agent_id ?? cur.agent_id,
    now(),
    id,
  );
  return getChat(id);
}

export function deleteChat(id: string) {
  db.prepare("DELETE FROM chats WHERE id = ?").run(id);
}

// ---------- messages ----------

export interface MessageRow extends Message {
  raw: unknown[] | null;
  raw_kind: string | null;
}

function toMessage(r: Row): MessageRow {
  return {
    ...(r as unknown as MessageRow),
    parts: JSON.parse(String(r.parts ?? "[]")),
    usage: r.usage ? JSON.parse(String(r.usage)) : null,
    raw: r.raw ? JSON.parse(String(r.raw)) : null,
  };
}

export function publicMessage(m: MessageRow): Message {
  const { raw, raw_kind, ...rest } = m;
  return rest;
}

export function listMessages(chat_id: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid")
    .all(chat_id)
    .map(toMessage);
}

export function insertMessage(m: {
  chat_id: string;
  role: "user" | "assistant";
  content?: string;
  agent_id?: string | null;
  model?: string | null;
  status?: Message["status"];
}): MessageRow {
  const id = newId();
  db.prepare(
    `INSERT INTO messages (id, chat_id, role, content, agent_id, model, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    m.chat_id,
    m.role,
    m.content ?? "",
    m.agent_id ?? null,
    m.model ?? null,
    m.status ?? "done",
    now(),
  );
  db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now(), m.chat_id);
  return toMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id)!);
}

export function finishMessage(
  id: string,
  m: {
    content: string;
    parts: unknown;
    raw: unknown[] | null;
    raw_kind: string | null;
    usage: unknown;
    status: Message["status"];
  },
): MessageRow {
  db.prepare(
    "UPDATE messages SET content = ?, parts = ?, raw = ?, raw_kind = ?, usage = ?, status = ? WHERE id = ?",
  ).run(
    m.content,
    JSON.stringify(m.parts),
    m.raw ? JSON.stringify(m.raw) : null,
    m.raw_kind,
    JSON.stringify(m.usage),
    m.status,
    id,
  );
  return toMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id)!);
}

// ---------- лента «отвлекалова» ----------

export interface FunItem {
  id: string;
  url: string;
  title: string;
  created_at: string;
}

export function listFun(): FunItem[] {
  return db.prepare("SELECT * FROM fun_items ORDER BY created_at DESC").all() as unknown as FunItem[];
}

export function addFun(url: string, title = ""): FunItem {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Это не похоже на ссылку");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Нужна ссылка http(s)");
  const id = newId();
  db.prepare("INSERT INTO fun_items (id, url, title, created_at) VALUES (?, ?, ?, ?)").run(id, u.toString(), title, now());
  return db.prepare("SELECT * FROM fun_items WHERE id = ?").get(id) as unknown as FunItem;
}

export function deleteFun(id: string) {
  db.prepare("DELETE FROM fun_items WHERE id = ?").run(id);
}

// ---------- произвольные служебные настройки ----------

export function getSetting(key: string): string | null {
  const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as string) : null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, JSON.stringify(value));
}

// ---------- пользовательские темы ----------

export function listThemes(): CustomTheme[] {
  return (db.prepare("SELECT * FROM custom_themes ORDER BY created_at").all() as Row[]).map((r) => ({
    ...(r as unknown as CustomTheme),
    vars: JSON.parse(String(r.vars ?? "{}")),
  }));
}

export function saveTheme(input: unknown, id?: string): CustomTheme {
  const t = sanitizeTheme(input);
  if (id && db.prepare("SELECT 1 FROM custom_themes WHERE id = ?").get(id)) {
    db.prepare("UPDATE custom_themes SET name = ?, base = ?, vars = ?, css = ? WHERE id = ?").run(
      t.name, t.base, JSON.stringify(t.vars), t.css, id,
    );
  } else {
    id = newId();
    db.prepare("INSERT INTO custom_themes (id, name, base, vars, css, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, t.name, t.base, JSON.stringify(t.vars), t.css, now(),
    );
  }
  return listThemes().find((x) => x.id === id)!;
}

export function deleteTheme(id: string) {
  db.prepare("DELETE FROM custom_themes WHERE id = ?").run(id);
}
