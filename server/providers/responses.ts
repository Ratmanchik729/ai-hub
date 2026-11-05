// OpenAI Responses API (Codex-модели, reasoning-модели GPT).
import type OpenAI from "openai";
import { openaiClient } from "./openai.ts";
import type { TurnRequest, TurnResult } from "./types.ts";
import { MAX_TOOL_STEPS } from "./types.ts";

type InputItem = OpenAI.Responses.ResponseInputItem;

export async function runResponses(req: TurnRequest): Promise<TurnResult> {
  const client = openaiClient(req.provider);
  const { agent } = req;
  const usage = { input: 0, output: 0 };
  let finalText = "";

  // Между ходами история передаётся текстом; внутри хода цепочка держится через previous_response_id.
  let input: InputItem[] = [];
  for (const h of req.history) {
    if (h.content.trim()) input.push({ role: h.role, content: h.content });
  }
  input.push({ role: "user", content: req.userText });

  const tools: OpenAI.Responses.FunctionTool[] = req.tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
    strict: false,
  }));

  let previous: string | undefined;
  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const stream = await client.responses.create(
      {
        model: agent.model,
        instructions: req.system || undefined,
        input,
        previous_response_id: previous,
        stream: true,
        ...(tools.length ? { tools } : {}),
        ...(agent.effort
          ? {
              reasoning: {
                effort: (["low", "medium", "high"].includes(agent.effort) ? agent.effort : "high") as
                  | "low"
                  | "medium"
                  | "high",
                summary: "auto",
              },
            }
          : {}),
        ...(agent.max_tokens ? { max_output_tokens: agent.max_tokens } : {}),
      },
      { signal: req.signal },
    );

    let text = "";
    let responseId = "";
    const calls: OpenAI.Responses.ResponseFunctionToolCall[] = [];

    for await (const ev of stream) {
      switch (ev.type) {
        case "response.output_text.delta":
          text += ev.delta;
          req.emit({ type: "text", delta: ev.delta });
          break;
        case "response.reasoning_summary_text.delta":
          req.emit({ type: "thinking", delta: ev.delta });
          break;
        case "response.output_item.done":
          req.emit({ type: "block_end" });
          if (ev.item.type === "function_call") calls.push(ev.item);
          break;
        case "response.completed":
        case "response.incomplete":
          responseId = ev.response.id;
          usage.input += ev.response.usage?.input_tokens ?? 0;
          usage.output += ev.response.usage?.output_tokens ?? 0;
          if (ev.type === "response.incomplete") {
            req.emit({
              type: "notice",
              text: `Ответ неполный: ${ev.response.incomplete_details?.reason ?? "неизвестная причина"}`,
            });
          }
          break;
        case "response.failed":
          throw new Error(ev.response.error?.message ?? "Responses API: запрос завершился ошибкой");
        case "error":
          throw new Error(ev.message);
      }
    }
    if (text) finalText = text;
    if (!calls.length || !responseId) break;

    const results = await Promise.all(
      calls.map(async (c) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(c.arguments || "{}");
        } catch {
          return { call_id: c.call_id, output: `Некорректный JSON аргументов: ${c.arguments}` };
        }
        const r = await req.callTool(c.call_id, c.name, parsed);
        return { call_id: c.call_id, output: r.output };
      }),
    );
    input = results.map((r) => ({ type: "function_call_output", call_id: r.call_id, output: r.output }));
    previous = responseId;

    if (step === MAX_TOOL_STEPS - 1) {
      req.emit({ type: "notice", text: `Остановлено: превышен лимит шагов (${MAX_TOOL_STEPS}).` });
    }
  }

  // raw не сохраняем: следующий ход восстановит историю из текста.
  return { text: finalText, raw: [], usage };
}
