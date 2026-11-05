// OpenAI-совместимые API: DeepSeek, Ollama, OpenRouter, OpenAI, vLLM, LM Studio и т.п.
import OpenAI from "openai";
import type { TurnRequest, TurnResult } from "./types.ts";
import { MAX_TOOL_STEPS } from "./types.ts";

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function openaiClient(p: { api_key: string | null; base_url: string | null }) {
  return new OpenAI({
    apiKey: p.api_key || "none", // Ollama и локальные серверы ключ не проверяют
    baseURL: p.base_url || undefined,
  });
}

function buildHistory(req: TurnRequest): Msg[] {
  const out: Msg[] = [];
  if (req.system) out.push({ role: "system", content: req.system });
  for (const h of req.history) {
    if (h.role === "user") out.push({ role: "user", content: h.content });
    else if (h.raw_kind === "openai" && h.raw?.length) out.push(...(h.raw as Msg[]));
    else if (h.content.trim()) out.push({ role: "assistant", content: h.content });
  }
  out.push({ role: "user", content: req.userText });
  return out;
}

export async function runOpenAI(req: TurnRequest): Promise<TurnResult> {
  const client = openaiClient(req.provider);
  const { agent } = req;
  const messages = buildHistory(req);
  const startLen = messages.length;
  const usage = { input: 0, output: 0 };
  let finalText = "";

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = req.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const stream = await client.chat.completions.create(
      {
        model: agent.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools.length ? { tools } : {}),
        ...(agent.temperature != null ? { temperature: agent.temperature } : {}),
        ...(agent.max_tokens ? { max_tokens: agent.max_tokens } : {}),
      },
      { signal: req.signal },
    );

    let content = "";
    let finish: string | null = null;
    let inThinking = false;
    const calls: { id: string; name: string; args: string }[] = [];

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.input += chunk.usage.prompt_tokens ?? 0;
        usage.output += chunk.usage.completion_tokens ?? 0;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta as typeof choice.delta & {
        reasoning_content?: string | null;
        reasoning?: string | null;
      };
      // DeepSeek-reasoner отдаёт рассуждения в reasoning_content, Ollama/OpenRouter — в reasoning.
      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (reasoning) {
        inThinking = true;
        req.emit({ type: "thinking", delta: reasoning });
      }
      if (delta.content) {
        if (inThinking) {
          req.emit({ type: "block_end" });
          inThinking = false;
        }
        content += delta.content;
        req.emit({ type: "text", delta: delta.content });
      }
      for (const tc of delta.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    req.emit({ type: "block_end" });
    if (content) finalText = content;

    const toolCalls = calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${step}_${i}` }));

    // reasoning_content обратно не отправляем: DeepSeek отклоняет его во входных сообщениях.
    const assistant: Msg = {
      role: "assistant",
      content: content || null,
      ...(toolCalls.length
        ? {
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          }
        : {}),
    };

    if (finish === "length") {
      req.emit({ type: "notice", text: "Ответ обрезан по лимиту max_tokens." });
      if (!toolCalls.length) messages.push(assistant);
      break;
    }
    messages.push(assistant);
    if (!toolCalls.length) break;

    const results = await Promise.all(
      toolCalls.map(async (c) => {
        let input: unknown;
        try {
          input = JSON.parse(c.args || "{}");
        } catch {
          return { id: c.id, output: `Некорректный JSON аргументов: ${c.args}`, is_error: true };
        }
        const r = await req.callTool(c.id, c.name, input);
        return { id: c.id, ...r };
      }),
    );
    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.id, content: r.output });
    }

    if (step === MAX_TOOL_STEPS - 1) {
      req.emit({ type: "notice", text: `Остановлено: превышен лимит шагов (${MAX_TOOL_STEPS}).` });
      messages.splice(messages.length - results.length - 1);
    }
  }

  return { text: finalText, raw: messages.slice(startLen), usage };
}

export async function listOpenAIModels(p: { api_key: string | null; base_url: string | null }) {
  const client = openaiClient(p);
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  return ids.sort();
}
