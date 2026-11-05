export interface FunItem {
  id: string;
  url: string;
  title: string;
  created_at: string;
}

export interface FunMedia {
  id: string;
  url: string;
  title: string;
  link: string;
  source: string;
}

import type { CustomTheme } from "../../shared/themes.ts";
import type { Agent, Chat, Link, LinkKind, Message, OfficeSettings, Provider } from "../../shared/types.ts";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  providers: () => req<Provider[]>("GET", "/providers"),
  createProvider: (p: Partial<Provider> & { api_key?: string }) =>
    req<Provider>("POST", "/providers", p),
  updateProvider: (id: string, p: Partial<Provider> & { api_key?: string | null }) =>
    req<Provider>("PUT", `/providers/${id}`, p),
  deleteProvider: (id: string) => req("DELETE", `/providers/${id}`),
  models: (id: string) => req<{ models: string[]; error?: string }>("GET", `/providers/${id}/models`),

  agents: () => req<Agent[]>("GET", "/agents"),
  createAgent: (a: Partial<Agent>) => req<Agent>("POST", "/agents", a),
  updateAgent: (id: string, a: Partial<Agent>) => req<Agent>("PUT", `/agents/${id}`, a),
  deleteAgent: (id: string) => req("DELETE", `/agents/${id}`),

  links: () => req<Link[]>("GET", "/links"),
  createLink: (from_agent: string, to_agent: string, kind: LinkKind) =>
    req<Link>("POST", "/links", { from_agent, to_agent, kind }),
  updateLink: (id: string, l: { kind?: LinkKind; reverse?: boolean }) => req<Link>("PATCH", `/links/${id}`, l),
  deleteLink: (id: string) => req("DELETE", `/links/${id}`),
  settings: () => req<OfficeSettings>("GET", "/settings"),
  updateSettings: (s: Partial<OfficeSettings>) => req<OfficeSettings>("PUT", "/settings", s),

  funRandom: (source: string) =>
    req<{ items: FunMedia[]; error?: string }>("GET", `/fun/random?source=${source}`),
  funConfig: () => req<{ giphy: boolean }>("GET", "/fun/config"),
  setGiphyKey: (key: string | null) => req<{ giphy: boolean }>("PUT", "/fun/giphy-key", { key }),
  fun: () => req<FunItem[]>("GET", "/fun"),
  addFun: (url: string, title = "") => req<FunItem>("POST", "/fun", { url, title }),
  deleteFun: (id: string) => req("DELETE", `/fun/${id}`),

  themes: () => req<CustomTheme[]>("GET", "/themes"),
  createTheme: (t: Omit<CustomTheme, "id">) => req<CustomTheme>("POST", "/themes", t),
  updateTheme: (id: string, t: Omit<CustomTheme, "id">) => req<CustomTheme>("PUT", `/themes/${id}`, t),
  deleteTheme: (id: string) => req("DELETE", `/themes/${id}`),
  generateTheme: (agent_id: string, description: string) =>
    req<Omit<CustomTheme, "id"> & { missing: string[] }>("POST", "/themes/generate", { agent_id, description }),

  chats: () => req<Chat[]>("GET", "/chats"),
  createChat: (agent_id: string) => req<Chat>("POST", "/chats", { agent_id }),
  updateChat: (id: string, c: Partial<Chat>) => req<Chat>("PATCH", `/chats/${id}`, c),
  deleteChat: (id: string) => req("DELETE", `/chats/${id}`),
  messages: (id: string) =>
    req<{ messages: Message[]; running: boolean }>("GET", `/chats/${id}/messages`),
  send: (id: string, text: string) => req<{ message_id: string }>("POST", `/chats/${id}/send`, { text }),
  stop: (id: string) => req("POST", `/chats/${id}/stop`),
};
