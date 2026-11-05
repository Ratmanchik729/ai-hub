// Сборка дерева частей ответа из потока событий.
// Используется и сервером (для сохранения в БД), и браузером (для отрисовки).
import type { Part, RunEvent } from "./types.ts";

function container(root: Part[], path: string[]): Part[] {
  let parts = root;
  for (const id of path) {
    const d = parts.find((p) => p.type === "delegate" && p.id === id);
    if (!d || d.type !== "delegate") return parts;
    parts = d.parts;
  }
  return parts;
}

/** Мутирует root и возвращает его же. */
export function applyEvent(root: Part[], ev: RunEvent): Part[] {
  switch (ev.type) {
    case "text":
    case "thinking": {
      const parts = container(root, ev.path);
      const last = parts[parts.length - 1];
      if (last && last.type === ev.type && !(last as { closed?: boolean }).closed) {
        last.text += ev.delta;
      } else {
        parts.push({ type: ev.type, text: ev.delta });
      }
      break;
    }
    case "block_end": {
      const parts = container(root, ev.path);
      const last = parts[parts.length - 1] as { closed?: boolean } | undefined;
      if (last) last.closed = true;
      break;
    }
    case "tool_start":
      container(root, ev.path).push({
        type: "tool",
        id: ev.id,
        name: ev.name,
        input: ev.input,
        status: "running",
      });
      break;
    case "tool_end": {
      const t = container(root, ev.path).find((p) => p.type === "tool" && p.id === ev.id);
      if (t && t.type === "tool") {
        t.output = ev.output;
        t.is_error = ev.is_error;
        t.status = "done";
      }
      break;
    }
    case "delegate_start": {
      const parts = container(root, ev.path);
      // Делегирование — это тоже вызов инструмента; карточку инструмента заменяем карточкой задачи.
      const idx = parts.findIndex((p) => p.type === "tool" && p.id === ev.id);
      const card: Part = {
        type: "delegate",
        id: ev.id,
        mode: ev.mode,
        agent_id: ev.agent_id,
        agent_name: ev.agent_name,
        task: ev.task,
        status: "running",
        parts: [],
      };
      if (idx >= 0) parts[idx] = card;
      else parts.push(card);
      break;
    }
    case "delegate_end": {
      const d = container(root, ev.path).find((p) => p.type === "delegate" && p.id === ev.id);
      if (d && d.type === "delegate") {
        d.status = ev.status;
        d.result = ev.result;
        d.usage = ev.usage;
      }
      break;
    }
    case "notice":
    case "error":
      container(root, ev.path).push({ type: ev.type, text: ev.text });
      break;
  }
  return root;
}
