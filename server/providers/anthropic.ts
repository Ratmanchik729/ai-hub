import Anthropic from "@anthropic-ai/sdk";
import type { TurnRequest, TurnResult } from "./types.ts";
import { MAX_TOOL_STEPS } from "./types.ts";

// Модели, для которых включаем серверный fallback при отказе классификатора.
const FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

export const ANTHROPIC_MODELS = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-fable-5-1",
];

export function anthropicClient(p: { api_key: string | null; base_url: string | null }) {
  // Без ключа SDK сам возьмёт ANTHROPIC_API_KEY / профиль `ant auth login`.
  return new Anthropic({
    apiKey: p.api_key || undefined,
    baseURL: p.base_url || undefined,
  });
}

function buildHistory(req: TurnRequest): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of req.history) {
    if (h.role === "user") {
      out.push({ role: "user", content: h.content });
    } else if (h.raw_kind === "anthropic" && h.raw?.length) {
      // Воспроизводим ход как есть, включая thinking-блоки и вызовы инструментов.
      out.push(...(h.raw as Anthropic.Beta.BetaMessageParam[]));
    } else if (h.content.trim()) {
      out.push({ role: "assistant", content: h.content });
    }
  }
  out.push({ role: "user", content: req.userText });
  return out;
}

export async function runAnthropic(req: TurnRequest): Promise<TurnResult> {
  const client = anthropicClient(req.provider);
  const { agent } = req;
  const messages = buildHistory(req);
  const startLen = messages.length;
  const usage = { input: 0, output: 0 };
  let finalText = "";

  const tools: Anthropic.Beta.BetaTool[] = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }));

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const betas = ["thinking-binding-controls-2026-08-01"];
    const params: Record<string, unknown> = {
      model: agent.model,
      max_tokens: agent.max_tokens ?? 64000,
      system: req.system || undefined,
      messages,
      // Если история изменилась (например, поменяли системный промпт агента),
      // несовпавшие thinking-блоки отбрасываются вместо ошибки 400.
      thinking: {
        type: "adaptive",
        display: "summarized",
        block_binding: { prefix_mismatch_behavior: "drop_block" },
      },
      output_config: { effort: agent.effort ?? "high" },
      betas,
    };
    if (tools.length) params.tools = tools;
    if (FALLBACK_MODELS.has(agent.model)) {
      betas.push("server-side-fallback-2026-07-01");
      params.fallbacks = "default";
    }

    const stream = client.beta.messages.stream(
      params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
      { signal: req.signal },
    );

    for await (const ev of stream) {
      if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") req.emit({ type: "text", delta: ev.delta.text });
        else if (ev.delta.type === "thinking_delta")
          req.emit({ type: "thinking", delta: ev.delta.thinking });
      } else if (ev.type === "content_block_stop") {
        req.emit({ type: "block_end" });
      }
    }
    const msg = await stream.finalMessage();
    usage.input +=
      (msg.usage.input_tokens ?? 0) +
      (msg.usage.cache_read_input_tokens ?? 0) +
      (msg.usage.cache_creation_input_tokens ?? 0);
    usage.output += msg.usage.output_tokens ?? 0;

    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });

    for (const b of msg.content) {
      if (b.type === "fallback") {
        const fb = b as unknown as { from?: { model?: string }; to?: { model?: string } };
        req.emit({
          type: "notice",
          text: `${fb.from?.model ?? "модель"} отказалась, продолжила ${fb.to?.model ?? "резервная модель"}`,
        });
      }
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text) finalText = text;

    if (msg.stop_reason === "refusal") {
      const sd = (msg as unknown as { stop_details?: { category?: string; explanation?: string } })
        .stop_details;
      req.emit({
        type: "notice",
        text: `Модель отказалась отвечать${sd?.category ? ` (${sd.category})` : ""}${sd?.explanation ? `: ${sd.explanation}` : ""}`,
      });
      break;
    }

    const toolUses = msg.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (msg.stop_reason === "max_tokens") {
      req.emit({ type: "notice", text: "Ответ обрезан по лимиту max_tokens." });
      if (toolUses.length) {
        // Вход инструмента может быть неполным — не выполняем, закрываем ход.
        messages.pop();
      }
      break;
    }
    if (msg.stop_reason !== "tool_use" || !toolUses.length) break;

    const results = await Promise.all(
      toolUses.map(async (tu) => {
        const r = await req.callTool(tu.id, tu.name, tu.input);
        return {
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: r.output,
          is_error: r.is_error || undefined,
        };
      }),
    );
    messages.push({ role: "user", content: results });

    if (step === MAX_TOOL_STEPS - 1) {
      req.emit({ type: "notice", text: `Остановлено: превышен лимит шагов (${MAX_TOOL_STEPS}).` });
      // История должна заканчиваться ответом ассистента, а не tool_result — убираем хвост.
      messages.splice(messages.length - 2, 2);
    }
  }

  return { text: finalText, raw: messages.slice(startLen), usage };
}

export async function listAnthropicModels(p: { api_key: string | null; base_url: string | null }) {
  const client = anthropicClient(p);
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  return ids;
}
