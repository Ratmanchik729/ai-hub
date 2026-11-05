import { useEffect, useRef, useState } from "react";
import type { Agent, Chat, Message, RunEvent } from "../../../shared/types.ts";
import { applyEvent } from "../../../shared/parts.ts";
import { api } from "../api.ts";
import { Parts, Markdown } from "./Parts.tsx";

interface Props {
  chat: Chat;
  agents: Agent[];
  onChatUpdated: (c: Chat) => void;
  onActivity: () => void;
}

export function ChatView({ chat, agents, onChatUpdated, onActivity }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const agent = agents.find((a) => a.id === chat.agent_id);

  const subscribe = () => {
    esRef.current?.close();
    const es = new EventSource(`/api/chats/${chat.id}/events`);
    esRef.current = es;
    setRunning(true);
    let live: Message | null = null;
    let raf = 0;
    const rerender = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setTick((t) => t + 1);
        });
    };
    es.addEventListener("idle", () => {
      es.close();
      setRunning(false);
    });
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as RunEvent;
      if (ev.type === "start") {
        live = { ...ev.message, parts: [] };
        const m = live;
        setMessages((ms) => [...ms.filter((x) => x.id !== m.id), m]);
      } else if (ev.type === "done") {
        es.close();
        setRunning(false);
        setMessages((ms) => ms.map((x) => (x.id === ev.message.id ? ev.message : x)));
        onActivity();
      } else if (live) {
        // Мутируем части «живого» сообщения и перерисовываем не чаще кадра.
        applyEvent(live.parts, ev);
        rerender();
      }
    };
    es.onerror = () => {
      // EventSource сам переподключится; события хода сервер отдаст заново.
      if (es.readyState === EventSource.CLOSED) setRunning(false);
    };
  };

  useEffect(() => {
    let cancelled = false;
    api.messages(chat.id).then(({ messages, running }) => {
      if (cancelled) return;
      setMessages(messages);
      if (running) subscribe();
    });
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });

  const send = async () => {
    const text = input.trim();
    if (!text || running) return;
    setError(null);
    setInput("");
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      chat_id: chat.id,
      role: "user",
      content: text,
      parts: [],
      agent_id: null,
      model: null,
      usage: null,
      status: "done",
      created_at: new Date().toISOString(),
    };
    setMessages((ms) => [...ms, optimistic]);
    stickRef.current = true;
    try {
      await api.send(chat.id, text);
      subscribe();
      if (chat.title === "Новый чат") onChatUpdated({ ...chat, title: text.slice(0, 60) });
    } catch (e) {
      setError((e as Error).message);
      setMessages((ms) => ms.filter((m) => m.id !== optimistic.id));
      setInput(text);
    }
  };

  const changeAgent = async (agent_id: string) => {
    const c = await api.updateChat(chat.id, { agent_id });
    onChatUpdated(c);
  };

  return (
    <div className="chat" data-title={chat.title}>
      <header className="chat-header">
        <div className="chat-title">{chat.title}</div>
        <label className="agent-pick">
          Агент:
          <select value={chat.agent_id} onChange={(e) => changeAgent(e.target.value)} disabled={running}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.model}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div
        className="messages"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.map((m) => {
          const a = agents.find((x) => x.id === m.agent_id);
          return (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.role === "user" ? (
                <div className="bubble">
                  <Markdown text={m.content} />
                </div>
              ) : (
                <div className="assistant-body">
                  <div className="who">
                    <span className="dot" style={{ background: a?.color ?? "#888" }} />
                    {a?.name ?? "агент"} <span className="muted">{m.model}</span>
                    {m.status === "streaming" && <span className="spinner" />}
                    {m.status === "stopped" && <span className="badge">остановлено</span>}
                    {m.status === "error" && <span className="badge err">ошибка</span>}
                  </div>
                  <Parts parts={m.parts} agents={agents} />
                  {m.usage && (m.usage.input > 0 || m.usage.output > 0) && (
                    <div className="usage">
                      токены: ↑{m.usage.input.toLocaleString()} ↓{m.usage.output.toLocaleString()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="composer" data-title="ВВОД">
        {error && <div className="error-line">{error}</div>}
        <textarea
          value={input}
          placeholder={`Сообщение для «${agent?.name ?? "агента"}»… (Enter — отправить, Shift+Enter — новая строка)`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
        />
        {running ? (
          <button className="danger" onClick={() => api.stop(chat.id)}>
            ■ Стоп
          </button>
        ) : (
          <button className="primary" onClick={send} disabled={!input.trim()}>
            Отправить
          </button>
        )}
      </footer>
    </div>
  );
}
