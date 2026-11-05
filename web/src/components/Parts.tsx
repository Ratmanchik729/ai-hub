import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Agent, Part } from "../../../shared/types.ts";

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

function Collapsible({
  title,
  className,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`card ${className ?? ""} ${open ? "open" : ""}`}>
      <div className="card-head" onClick={() => setOpen((o) => !o)}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        {title}
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

export function Parts({ parts, agents }: { parts: Part[]; agents: Agent[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.type) {
          case "text":
            return <Markdown key={i} text={p.text} />;
          case "thinking":
            return p.text.trim() ? (
              <Collapsible key={i} className="thinking" title={<span className="muted">Рассуждения</span>}>
                <div className="pre">{p.text}</div>
              </Collapsible>
            ) : null;
          case "tool":
            return (
              <Collapsible
                key={p.id}
                className="tool"
                title={
                  <>
                    <code>{p.name}</code>
                    {p.status === "running" ? <span className="spinner" /> : p.is_error ? " ✗" : " ✓"}
                  </>
                }
              >
                <div className="label">Вход</div>
                <pre>{JSON.stringify(p.input, null, 2)}</pre>
                {p.output !== undefined && (
                  <>
                    <div className="label">Результат</div>
                    <pre>{p.output}</pre>
                  </>
                )}
              </Collapsible>
            );
          case "delegate": {
            const a = agents.find((x) => x.id === p.agent_id);
            return (
              <Collapsible
                key={p.id}
                className={`delegate ${p.status}`}
                defaultOpen={p.status === "running"}
                title={
                  <>
                    <span className={`mode ${p.mode ?? "delegate"}`}>{p.mode === "consult" ? "вопрос" : "задача"}</span>
                    <span className="dot" style={{ background: a?.color ?? "#888" }} />
                    <b>{p.agent_name}</b>
                    <span className="task-preview">{p.task}</span>
                    {p.status === "running" && <span className="spinner" />}
                    {p.status === "error" && <span className="badge err">ошибка</span>}
                    {p.usage && (
                      <span className="muted small">
                        ↑{p.usage.input.toLocaleString()} ↓{p.usage.output.toLocaleString()}
                      </span>
                    )}
                  </>
                }
              >
                <div className="label">{p.mode === "consult" ? "Вопрос" : "Задача"}</div>
                <div className="task-full">
                  <Markdown text={p.task} />
                </div>
                <div className="label">{p.mode === "consult" ? "Ответ коллеги" : "Работа исполнителя"}</div>
                <div className="nested">
                  <Parts parts={p.parts} agents={agents} />
                </div>
              </Collapsible>
            );
          }
          case "notice":
            return (
              <div key={i} className="notice">
                ⚠ {p.text}
              </div>
            );
          case "error":
            return (
              <div key={i} className="error-line">
                ✗ {p.text}
              </div>
            );
        }
      })}
    </>
  );
}
