import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  ConnectionMode,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Agent, Link, LinkKind, OfficeSettings, Provider } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { isDarkTheme, type Theme } from "../theme.ts";

type AgentNodeData = { agent: Agent; provider?: Provider; subs: number; cols: number };
type AgentNode = Node<AgentNodeData, "agent">;

function AgentCard({ data, selected }: NodeProps<AgentNode>) {
  const { agent, provider } = data;
  return (
    <div className={`office-node ${selected ? "selected" : ""}`} style={{ borderTopColor: agent.color }}>
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <div className="office-node-name">
        <span className="dot" style={{ background: agent.color }} />
        {agent.name}
      </div>
      <div className="office-node-model">
        {provider?.name ?? "?"} · {agent.model}
      </div>
      {agent.description && <div className="office-node-desc">{agent.description}</div>}
      <Handle type="source" position={Position.Bottom} id="b" />
    </div>
  );
}

const nodeTypes = { agent: AgentCard };

/** Раскладка по уровням иерархии: руководители сверху, подчинённые ниже. */
function autoLayout(agents: Agent[], links: Link[]): Record<string, { x: number; y: number }> {
  const level: Record<string, number> = {};
  const manages = links.filter((l) => l.kind === "manages");
  const hasBoss = new Set(manages.map((l) => l.to_agent));
  const queue = agents.filter((a) => !hasBoss.has(a.id)).map((a) => a.id);
  for (const id of queue) level[id] = 0;
  // Обход в ширину; ограничение итераций защищает от циклов.
  for (let i = 0; i < queue.length && i < 1000; i++) {
    const id = queue[i];
    for (const l of manages.filter((m) => m.from_agent === id)) {
      if (level[l.to_agent] === undefined) {
        level[l.to_agent] = level[id] + 1;
        queue.push(l.to_agent);
      }
    }
  }
  for (const a of agents) level[a.id] ??= 0;
  const rows: Record<number, string[]> = {};
  for (const a of agents) (rows[level[a.id]] ??= []).push(a.id);
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [lv, ids] of Object.entries(rows)) {
    ids.forEach((id, i) => {
      pos[id] = { x: (i - (ids.length - 1) / 2) * 260, y: Number(lv) * 180 };
    });
  }
  return pos;
}

interface Props {
  agents: Agent[];
  providers: Provider[];
  links: Link[];
  onChange: () => void;
  openChat: (agentId: string) => void;
  editAgent: () => void;
  theme: Theme;
}

export function OfficePage({ agents, providers, links, onChange, openChat, editAgent, theme }: Props) {
  const [mode, setMode] = useState<LinkKind>("manages");
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(setSettings);
  }, []);

  // Пересобираем узлы при изменении агентов, сохраняя текущие позиции.
  useEffect(() => {
    const auto = autoLayout(agents, links);
    setNodes((prev) => {
      const prevPos = new Map(prev.map((n) => [n.id, n.position]));
      return agents.map((a) => ({
        id: a.id,
        type: "agent" as const,
        position: prevPos.get(a.id) ?? (a.x != null && a.y != null ? { x: a.x, y: a.y } : auto[a.id]),
        data: {
          agent: a,
          provider: providers.find((p) => p.id === a.provider_id),
          subs: links.filter((l) => l.kind === "manages" && l.from_agent === a.id).length,
          cols: links.filter((l) => l.kind === "consults" && (l.from_agent === a.id || l.to_agent === a.id)).length,
        },
        deletable: false,
      }));
    });
  }, [agents, providers, links]);

  const edges: Edge[] = useMemo(
    () =>
      links.map((l) =>
        l.kind === "manages"
          ? {
              id: l.id,
              source: l.from_agent,
              target: l.to_agent,
              sourceHandle: "b",
              targetHandle: "t",
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent)" },
              style: { stroke: "var(--accent)", strokeWidth: 2 },
              selected: l.id === selEdge,
            }
          : {
              id: l.id,
              source: l.from_agent,
              target: l.to_agent,
              sourceHandle: "r",
              targetHandle: "l",
              type: "default",
              label: "коллеги",
              labelStyle: { fill: "var(--ok)", fontSize: 14 },
              labelBgStyle: { fill: "var(--panel)" },
              style: { stroke: "var(--ok)", strokeWidth: 2, strokeDasharray: "6 4" },
              selected: l.id === selEdge,
            },
      ),
    [links, selEdge],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    run(() => api.createLink(c.source, c.target, mode));
  };

  const arrange = () => {
    const pos = autoLayout(agents, links);
    setNodes((nds) => nds.map((n) => ({ ...n, position: pos[n.id] ?? n.position })));
    run(() => Promise.all(agents.map((a) => api.updateAgent(a.id, pos[a.id]))));
  };

  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? "?";
  const edge = links.find((l) => l.id === selEdge);
  const node = agents.find((a) => a.id === selNode);

  const rel = (id: string) => ({
    bosses: links.filter((l) => l.kind === "manages" && l.to_agent === id).map((l) => name(l.from_agent)),
    subs: links.filter((l) => l.kind === "manages" && l.from_agent === id).map((l) => name(l.to_agent)),
    cols: links
      .filter((l) => l.kind === "consults" && (l.from_agent === id || l.to_agent === id))
      .map((l) => name(l.from_agent === id ? l.to_agent : l.from_agent)),
  });

  if (!agents.length) {
    return (
      <div className="page">
        <h1>Офис</h1>
        <p>
          Пока нет ни одного агента. <a href="#" onClick={(e) => { e.preventDefault(); editAgent(); }}>Создай агентов</a>, а потом
          расставь их здесь и проведи связи.
        </p>
      </div>
    );
  }

  return (
    <div className="office">
      <div className="office-toolbar">
        <b>Офис</b>
        <div className="seg">
          <span className="muted small">Новая связь:</span>
          <button className={mode === "manages" ? "active manages" : ""} onClick={() => setMode("manages")}>
            → Руководит
          </button>
          <button className={mode === "consults" ? "active consults" : ""} onClick={() => setMode("consults")}>
            ⇢ Коллеги
          </button>
        </div>
        <span className="muted small hide-narrow">
          {mode === "manages"
            ? "Тяни от руководителя к подчинённому"
            : "Тяни между двумя агентами — они смогут задавать друг другу вопросы"}
        </span>
        <div className="grow" />
        {settings && (
          <label className="depth" title="Сколько уровней поручений вниз от агента, с которым ты говоришь">
            Глубина цепочки
            <input
              type="number"
              min={1}
              max={10}
              value={settings.max_depth}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= 10) api.updateSettings({ max_depth: v }).then(setSettings);
              }}
            />
          </label>
        )}
        <button onClick={arrange}>Авторасстановка</button>
        <button onClick={editAgent}>+ Агент</button>
      </div>

      <div className="office-body">
        <div className="office-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={isDarkTheme(theme) ? "dark" : "light"}
            connectionMode={ConnectionMode.Loose}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onNodeDragStop={(_, n) => api.updateAgent(n.id, { x: n.position.x, y: n.position.y })}
            onNodeClick={(_, n) => {
              setSelNode(n.id);
              setSelEdge(null);
            }}
            onEdgeClick={(_, e) => {
              setSelEdge(e.id);
              setSelNode(null);
            }}
            onPaneClick={() => {
              setSelEdge(null);
              setSelNode(null);
            }}
            onEdgesDelete={(es) => run(() => Promise.all(es.map((e) => api.deleteLink(e.id))))}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
            <Controls />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data as AgentNodeData).agent.color} />
          </ReactFlow>
        </div>

        <aside className="office-panel" data-title="ИНФО">
          {error && <div className="error-line">{error}</div>}
          {edge ? (
            <>
              <h3>Связь</h3>
              <p>
                {edge.kind === "manages" ? (
                  <>
                    <b>{name(edge.from_agent)}</b> руководит <b>{name(edge.to_agent)}</b>: может поручать задачи через{" "}
                    <code>delegate_task</code>.
                  </>
                ) : (
                  <>
                    <b>{name(edge.from_agent)}</b> и <b>{name(edge.to_agent)}</b> — коллеги: оба могут задавать друг
                    другу вопросы через <code>ask_colleague</code>.
                  </>
                )}
              </p>
              <div className="actions col">
                {edge.kind === "manages" && (
                  <button onClick={() => run(() => api.updateLink(edge.id, { reverse: true }))}>
                    ⇅ Поменять направление
                  </button>
                )}
                <button
                  onClick={() =>
                    run(() => api.updateLink(edge.id, { kind: edge.kind === "manages" ? "consults" : "manages" }))
                  }
                >
                  {edge.kind === "manages" ? "Сделать коллегами" : "Сделать руководство"}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setSelEdge(null);
                    run(() => api.deleteLink(edge.id));
                  }}
                >
                  Удалить связь
                </button>
              </div>
            </>
          ) : node ? (
            <>
              <h3>
                <span className="dot" style={{ background: node.color }} /> {node.name}
              </h3>
              <div className="muted small">
                {providers.find((p) => p.id === node.provider_id)?.name} · {node.model}
              </div>
              {node.description && <p>{node.description}</p>}
              {(() => {
                const r = rel(node.id);
                return (
                  <dl className="rel">
                    <dt>Руководитель</dt>
                    <dd>{r.bosses.join(", ") || "—"}</dd>
                    <dt>Подчинённые</dt>
                    <dd>{r.subs.join(", ") || "—"}</dd>
                    <dt>Коллеги</dt>
                    <dd>{r.cols.join(", ") || "—"}</dd>
                  </dl>
                );
              })()}
              <div className="actions col">
                <button className="primary" onClick={() => openChat(node.id)}>
                  Начать чат
                </button>
                <button onClick={editAgent}>Редактировать агентов</button>
              </div>
            </>
          ) : (
            <>
              <h3>Как это работает</h3>
              <ul className="help">
                <li>
                  <span className="sw manages" /> <b>Руководит</b> — стрелка от руководителя к подчинённому. Руководитель
                  получает инструмент <code>delegate_task</code>, а подчинённый выполняет задачу и возвращает результат.
                </li>
                <li>
                  <span className="sw consults" /> <b>Коллеги</b> — пунктир. Оба могут задавать друг другу вопросы через{" "}
                  <code>ask_colleague</code>.
                </li>
                <li>Нет связи — нет общения. Агент видит только тех, с кем связан.</li>
                <li>Агент, уже участвующий в цепочке, не может быть вызван повторно — циклов не будет.</li>
                <li>
                  <b>Глубина цепочки</b> ограничивает число уровней поручений вниз от агента, с которым ты говоришь.
                </li>
                <li>Клик по связи — изменить или удалить. Delete — удалить выделенную связь.</li>
                <li>Начать чат можно с любым агентом: с руководителем — чтобы работала вся команда.</li>
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
