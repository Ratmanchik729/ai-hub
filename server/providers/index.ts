// Реестр адаптеров. Чтобы подключить новый тип API:
// 1) напиши server/providers/<kind>.ts с функциями run и listModels;
// 2) добавь его сюда и в PROVIDER_KINDS (shared/providers.ts).
import type { ProviderKind } from "../../shared/providers.ts";
import type { TurnRequest, TurnResult } from "./types.ts";
import { ANTHROPIC_MODELS, listAnthropicModels, runAnthropic } from "./anthropic.ts";
import { listOpenAIModels, runOpenAI } from "./openai.ts";
import { runResponses } from "./responses.ts";

type Creds = { api_key: string | null; base_url: string | null };

export interface Adapter {
  run: (req: TurnRequest) => Promise<TurnResult>;
  listModels: (p: Creds) => Promise<string[]>;
  /** Что показать, если список моделей получить не удалось. */
  fallbackModels: string[];
}

export const ADAPTERS: Record<ProviderKind, Adapter> = {
  anthropic: { run: runAnthropic, listModels: listAnthropicModels, fallbackModels: ANTHROPIC_MODELS },
  openai: { run: runOpenAI, listModels: listOpenAIModels, fallbackModels: [] },
  "openai-responses": { run: runResponses, listModels: listOpenAIModels, fallbackModels: [] },
};

export function adapterFor(kind: string): Adapter {
  const a = ADAPTERS[kind as ProviderKind];
  if (!a) throw new Error(`Неизвестный тип провайдера: ${kind}`);
  return a;
}
