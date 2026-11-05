// Общие типы для сервера и веб-интерфейса.
import type { ProviderKind } from "./providers.ts";
export type { ProviderKind };

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  base_url: string | null;
  /** Наружу ключ не отдаётся — только признак, что он задан. */
  has_key: boolean;
  created_at: string;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Agent {
  id: string;
  name: string;
  /** Короткое описание роли — его видит руководитель, когда выбирает исполнителя. */
  description: string;
  provider_id: string;
  model: string;
  system_prompt: string;
  effort: Effort | null; // Anthropic и Responses API
  temperature: number | null; // Chat Completions
  max_tokens: number | null;
  color: string;
  /** Позиция карточки в редакторе офиса. */
  x: number | null;
  y: number | null;
  created_at: string;
}

/**
 * Связь в офисе.
 * manages  — from руководит to: может поручать ему задачи (delegate_task). Направленная.
 * consults — from и to коллеги: оба могут задавать друг другу вопросы (ask_colleague). Взаимная.
 */
export type LinkKind = "manages" | "consults";

export interface Link {
  id: string;
  from_agent: string;
  to_agent: string;
  kind: LinkKind;
  created_at: string;
}

export interface OfficeSettings {
  /** Максимальная глубина цепочки поручений/вопросов. */
  max_depth: number;
}

export type DelegateMode = "delegate" | "consult";

export interface Chat {
  id: string;
  title: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
}

export interface Usage {
  input: number;
  output: number;
}

/** Части ответа: текст, рассуждения, вызовы инструментов, делегированные задачи (рекурсивно). */
export type Part =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      input: unknown;
      output?: string;
      is_error?: boolean;
      status: "running" | "done";
    }
  | {
      type: "delegate";
      id: string;
      mode: DelegateMode;
      agent_id: string;
      agent_name: string;
      task: string;
      status: "running" | "done" | "error";
      parts: Part[];
      result?: string;
      usage?: Usage;
    }
  | { type: "notice"; text: string }
  | { type: "error"; text: string };

export interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  parts: Part[];
  agent_id: string | null;
  model: string | null;
  usage: Usage | null;
  status: "streaming" | "done" | "error" | "stopped";
  created_at: string;
}

/**
 * События, которые сервер шлёт в браузер по SSE.
 * path — цепочка id делегированных задач до контейнера, куда относится событие.
 */
export type RunEvent =
  | { type: "start"; message: Message }
  | { type: "text"; path: string[]; delta: string }
  | { type: "thinking"; path: string[]; delta: string }
  | { type: "block_end"; path: string[] }
  | { type: "tool_start"; path: string[]; id: string; name: string; input: unknown }
  | { type: "tool_end"; path: string[]; id: string; output: string; is_error: boolean }
  | {
      type: "delegate_start";
      path: string[];
      id: string;
      mode: DelegateMode;
      agent_id: string;
      agent_name: string;
      task: string;
    }
  | {
      type: "delegate_end";
      path: string[];
      id: string;
      status: "done" | "error";
      result: string;
      usage: Usage;
    }
  | { type: "notice"; path: string[]; text: string }
  | { type: "error"; path: string[]; text: string }
  | { type: "done"; message: Message };
