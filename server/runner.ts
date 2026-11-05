// Запуск агентов и оркестрация: ход агента, инструменты, поручения и вопросы по связям офиса.
import type { Agent, DelegateMode, Part, RunEvent, Usage } from "../shared/types.ts";
import { applyEvent } from "../shared/parts.ts";
import {
  finishMessage,
  getAgent,
  getChat,
  getProvider,
  getSettings,
  insertMessage,
  listLinks,
  listMessages,
  publicMessage,
  updateChat,
  type MessageRow,
} from "./db.ts";
import { adapterFor } from "./providers/index.ts";
import type { AdapterEvent, HistoryItem, ToolDef, ToolResult, TurnResult } from "./providers/types.ts";

interface Run {
  chatId: string;
  messageId: string;
  controller: AbortController;
  events: RunEvent[];
  subscribers: Set<(ev: RunEvent) => void>;
}

const runs = new Map<string, Run>();

export function getRun(chatId: string) {
  return runs.get(chatId);
}

export function stopRun(chatId: string) {
  runs.get(chatId)?.controller.abort();
}

// ---------- оргструктура ----------

interface Relations {
  subordinates: Agent[]; // кому можно поручать
  colleagues: Agent[]; // кого можно спрашивать
  managers: Agent[]; // кто руководит (для контекста)
}

function relationsOf(agent: Agent): Relations {
  const links = listLinks();
  const byId = (id: string) => getAgent(id);
  const uniq = (xs: (Agent | undefined)[]) =>
    [...new Map(xs.filter((a): a is Agent => !!a).map((a) => [a.id, a])).values()];
  return {
    subordinates: uniq(links.filter((l) => l.kind === "manages" && l.from_agent === agent.id).map((l) => byId(l.to_agent))),
    managers: uniq(links.filter((l) => l.kind === "manages" && l.to_agent === agent.id).map((l) => byId(l.from_agent))),
    colleagues: uniq(
      links
        .filter((l) => l.kind === "consults" && (l.from_agent === agent.id || l.to_agent === agent.id))
        .map((l) => byId(l.from_agent === agent.id ? l.to_agent : l.from_agent)),
    ),
  };
}

// ---------- инструменты ----------

const TOOL_MODE: Record<string, DelegateMode> = { delegate_task: "delegate", ask_colleague: "consult" };

function delegateTool(subs: Agent[]): ToolDef {
  return {
    name: "delegate_task",
    description:
      "Поручить задачу подчинённому агенту и получить его результат. " +
      "Исполнитель НЕ видит переписку: передай в task и context всё, что ему нужно знать. " +
      "Независимые подзадачи можно поручать параллельно.",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", enum: subs.map((s) => s.name), description: "Имя подчинённого" },
        task: { type: "string", description: "Чёткая формулировка задачи и ожидаемого результата" },
        context: { type: "string", description: "Дополнительные данные, нужные для работы" },
      },
      required: ["agent", "task"],
      additionalProperties: false,
    },
  };
}

function consultTool(cols: Agent[]): ToolDef {
  return {
    name: "ask_colleague",
    description:
      "Задать вопрос коллеге (не подчинённому) и получить ответ: мнение, проверку, справку. " +
      "Коллега НЕ видит переписку — сформулируй вопрос самодостаточно.",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", enum: cols.map((s) => s.name), description: "Имя коллеги" },
        task: { type: "string", description: "Вопрос" },
        context: { type: "string", description: "Данные, на которые опирается вопрос" },
      },
      required: ["agent", "task"],
      additionalProperties: false,
    },
  };
}

function listing(xs: Agent[]) {
  return xs.map((a) => `- **${a.name}** (${a.model})${a.description ? `: ${a.description}` : ""}`).join("\n");
}

function buildSystem(agent: Agent, rel: Relations, canAct: boolean): string {
  let s = agent.system_prompt.trim();
  const office: string[] = [];
  if (rel.managers.length) office.push(`Тобой руководит: ${rel.managers.map((a) => a.name).join(", ")}.`);
  if (canAct && rel.subordinates.length) {
    office.push(
      `Твои подчинённые — им можно поручать задачи через delegate_task:\n${listing(rel.subordinates)}\n` +
        `Разбивай работу на подзадачи, раздавай подходящим исполнителям, проверяй результаты и собирай итог. Простое делай сам.`,
    );
  }
  if (canAct && rel.colleagues.length) {
    office.push(`Твои коллеги — им можно задавать вопросы через ask_colleague:\n${listing(rel.colleagues)}`);
  }
  if (office.length) s += `\n\n## Офис\nТы — «${agent.name}».\n${office.join("\n\n")}`;
  return s.trim();
}

// ---------- запуск одного агента ----------

interface AgentRunCtx {
  path: string[];
  /** id агентов в текущей цепочке вызовов — чтобы не зациклиться. */
  stack: string[];
  maxDepth: number;
  signal: AbortSignal;
  emit: (ev: RunEvent) => void;
  addUsage: (u: Usage) => void;
}

async function runAgent(
  agent: Agent,
  history: HistoryItem[],
  userText: string,
  ctx: AgentRunCtx,
): Promise<TurnResult & { kind: string }> {
  const provider = getProvider(agent.provider_id);
  if (!provider) throw new Error(`У агента «${agent.name}» не найден провайдер`);

  const stack = [...ctx.stack, agent.id];
  const canAct = stack.length <= ctx.maxDepth;
  const rel = relationsOf(agent);
  // Тех, кто уже в цепочке, звать нельзя — иначе A→B→A по кругу.
  const subs = canAct ? rel.subordinates.filter((a) => !stack.includes(a.id)) : [];
  const cols = canAct ? rel.colleagues.filter((a) => !stack.includes(a.id)) : [];
  const tools: ToolDef[] = [];
  if (subs.length) tools.push(delegateTool(subs));
  if (cols.length) tools.push(consultTool(cols));
  const { path } = ctx;

  const callTool = async (id: string, name: string, input: unknown): Promise<ToolResult> => {
    ctx.emit({ type: "tool_start", path, id, name, input });
    const fail = (output: string): ToolResult => {
      const r = { output, is_error: true };
      ctx.emit({ type: "tool_end", path, id, ...r });
      return r;
    };
    const mode = TOOL_MODE[name];
    if (!mode) return fail(`Неизвестный инструмент: ${name}`);
    const pool = mode === "delegate" ? subs : cols;
    const inp = (input ?? {}) as { agent?: unknown; task?: unknown; context?: unknown };
    const target = pool.find((s) => s.name === inp.agent);
    if (!target || typeof inp.task !== "string" || !inp.task.trim()) {
      return fail(`Некорректный вызов: укажи agent (одно из: ${pool.map((s) => s.name).join(", ")}) и непустой task`);
    }
    const prompt =
      (mode === "consult" ? `Вопрос от коллеги «${agent.name}»:\n\n` : `Задача от руководителя «${agent.name}»:\n\n`) +
      inp.task +
      (typeof inp.context === "string" && inp.context.trim() ? `\n\n## Контекст\n${inp.context}` : "");
    ctx.emit({
      type: "delegate_start",
      path,
      id,
      mode,
      agent_id: target.id,
      agent_name: target.name,
      task: inp.task,
    });
    const subUsage = { input: 0, output: 0 };
    try {
      const r = await runAgent(target, [], prompt, {
        ...ctx,
        path: [...path, id],
        stack,
        addUsage: (u) => {
          subUsage.input += u.input;
          subUsage.output += u.output;
          ctx.addUsage(u);
        },
      });
      const result = r.text.trim() || "(агент не вернул текстового ответа)";
      ctx.emit({ type: "delegate_end", path, id, status: "done", result, usage: subUsage });
      return { output: result };
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      const msg = errorText(e);
      ctx.emit({ type: "delegate_end", path, id, status: "error", result: msg, usage: subUsage });
      return { output: `Агент «${target.name}» завершился с ошибкой: ${msg}`, is_error: true };
    }
  };

  const result = await adapterFor(provider.kind).run({
    provider,
    agent,
    system: buildSystem(agent, rel, canAct),
    history,
    userText,
    tools,
    signal: ctx.signal,
    emit: (ev: AdapterEvent) => ctx.emit({ ...ev, path } as RunEvent),
    callTool,
  });
  ctx.addUsage(result.usage);
  return { ...result, kind: provider.kind };
}

/** Понятное описание частых ошибок API + исходный текст для диагностики. */
export function friendlyError(status: number | undefined, message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes("credit balance") || m.includes("insufficient balance") || m.includes("insufficient_quota") || m.includes("exceeded your current quota") || status === 402) {
    return "На балансе API у провайдера закончились деньги. Пополни баланс в его консоли (Claude — platform.claude.com → Plans & Billing; DeepSeek — platform.deepseek.com → Top up; OpenAI — platform.openai.com → Billing) или переключи агента на другую модель, например локальную через Ollama.";
  }
  if (status === 401 || m.includes("invalid x-api-key") || m.includes("invalid api key") || m.includes("incorrect api key") || m.includes("authentication")) {
    return "Провайдер не принял API-ключ: он неверный, удалён или от другого сервиса. Проверь ключ на странице «Провайдеры» (кнопка «Проверить»).";
  }
  if (status === 403) {
    return "Доступ запрещён: у ключа нет прав на эту модель, или сервис недоступен из твоего региона.";
  }
  if (status === 404 || m.includes("model_not_found") || m.includes("does not exist")) {
    return "Модель не найдена. Проверь название модели в настройках агента — список доступных подтягивается кнопкой «Проверить» у провайдера.";
  }
  if (status === 429) {
    return "Слишком много запросов — сработал лимит провайдера. Подожди минуту или уменьши глубину цепочки в офисе.";
  }
  if (status === 529 || m.includes("overloaded")) {
    return "Сервера провайдера перегружены. Попробуй ещё раз через пару минут.";
  }
  if (m.includes("econnrefused") || m.includes("connection error") || m.includes("fetch failed")) {
    return "Не удалось подключиться к провайдеру. Проверь интернет и Base URL; для Ollama — что она запущена (`ollama serve`).";
  }
  return null;
}

function errorText(e: unknown): string {
  if (e instanceof Error) {
    const status = (e as { status?: number }).status;
    const raw = status ? `${status}: ${e.message}` : e.message;
    const hint = friendlyError(status, e.message);
    return hint ? `${hint}\n\nТехнические детали: ${raw}` : raw;
  }
  return String(e);
}

// ---------- запуск хода в чате ----------

export function startChatRun(chatId: string, userText: string): MessageRow {
  if (runs.has(chatId)) throw new Error("В этом чате уже идёт генерация");
  const chat = getChat(chatId);
  if (!chat) throw new Error("Чат не найден");
  const agent = getAgent(chat.agent_id);
  if (!agent) throw new Error("Агент чата не найден");

  const history: HistoryItem[] = listMessages(chatId).map((m) => ({
    role: m.role,
    content: m.content,
    raw: m.raw,
    raw_kind: m.raw_kind,
  }));

  insertMessage({ chat_id: chatId, role: "user", content: userText });
  if (chat.title === "Новый чат") {
    updateChat(chatId, { title: userText.replace(/\s+/g, " ").slice(0, 60) });
  }
  const assistant = insertMessage({
    chat_id: chatId,
    role: "assistant",
    agent_id: agent.id,
    model: agent.model,
    status: "streaming",
  });

  const run: Run = {
    chatId,
    messageId: assistant.id,
    controller: new AbortController(),
    events: [],
    subscribers: new Set(),
  };
  runs.set(chatId, run);

  const parts: Part[] = [];
  const usage = { input: 0, output: 0 };
  const emit = (ev: RunEvent) => {
    applyEvent(parts, ev);
    run.events.push(ev);
    for (const s of run.subscribers) s(ev);
  };
  emit({ type: "start", message: publicMessage(assistant) });

  (async () => {
    let final: MessageRow;
    try {
      const r = await runAgent(agent, history, userText, {
        path: [],
        stack: [],
        maxDepth: getSettings().max_depth, // стек длины N = N-й уровень; агент на уровне max_depth уже не раздаёт задачи
        signal: run.controller.signal,
        emit,
        addUsage: (u) => {
          usage.input += u.input;
          usage.output += u.output;
        },
      });
      final = finishMessage(assistant.id, {
        content: r.text,
        parts,
        raw: r.raw,
        raw_kind: r.kind,
        usage,
        status: "done",
      });
    } catch (e) {
      const stopped = run.controller.signal.aborted;
      if (!stopped) emit({ type: "error", path: [], text: errorText(e) });
      const text = parts
        .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("\n\n");
      final = finishMessage(assistant.id, {
        content: text,
        parts,
        raw: null,
        raw_kind: null,
        usage,
        status: stopped ? "stopped" : "error",
      });
    }
    emit({ type: "done", message: publicMessage(final) });
    runs.delete(chatId);
  })();

  return assistant;
}
