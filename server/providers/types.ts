import type { Agent, Usage } from "../../shared/types.ts";
import type { ProviderRow } from "../db.ts";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolResult {
  output: string;
  is_error?: boolean;
}

/** Прошлые сообщения чата: текст + (если есть) сообщения в родном формате провайдера. */
export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
  raw?: unknown[] | null;
  raw_kind?: string | null;
}

export type AdapterEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "block_end" }
  | { type: "notice"; text: string };

export interface TurnRequest {
  provider: ProviderRow;
  agent: Agent;
  system: string;
  history: HistoryItem[];
  userText: string;
  tools: ToolDef[];
  signal: AbortSignal;
  emit: (ev: AdapterEvent) => void;
  /** Вызывается для каждого tool call; параллельные вызовы выполняются одновременно. */
  callTool: (id: string, name: string, input: unknown) => Promise<ToolResult>;
}

export interface TurnResult {
  text: string;
  /** Новые сообщения этого хода в формате провайдера (без исходного сообщения пользователя). */
  raw: unknown[];
  usage: Usage;
}

export const MAX_TOOL_STEPS = 30;
