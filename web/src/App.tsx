import { useCallback, useEffect, useState } from "react";
import type { Agent, Chat, Link, Provider } from "../../shared/types.ts";
import { api } from "./api.ts";
import { ChatView } from "./components/ChatView.tsx";
import { AgentsPage } from "./components/AgentsPage.tsx";
import { ProvidersPage } from "./components/ProvidersPage.tsx";
import { OfficePage } from "./components/OfficePage.tsx";
import { applyTheme, resolveTheme, useBackground, useEvaScheme, useThemeId } from "./theme.ts";
import { ThemeEditor, captureCurrentVars, type ThemeDraft } from "./components/ThemeEditor.tsx";
import type { CustomTheme } from "../../shared/themes.ts";
import { BackgroundLayer, ViewMenu } from "./components/ViewMenu.tsx";
import { FunPanel } from "./fun/FunPanel.tsx";

type Page = "chat" | "office" | "agents" | "providers";

export function App() {
  const [page, setPage] = useState<Page>("chat");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [newAgent, setNewAgent] = useState("");
  const [themeId, setThemeId] = useThemeId();
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [editing, setEditing] = useState<ThemeDraft | null>(null);
  const [preview, setPreview] = useState<ThemeDraft | null>(null);
  const active = resolveTheme(themeId, customThemes);
  const theme = preview?.base ?? active.base;
  useEffect(() => {
    api.themes().then(setCustomThemes).catch(() => {});
  }, []);
  useEffect(() => {
    if (preview) applyTheme(preview.base, preview.vars, preview.css);
    else applyTheme(active.base, active.vars, active.css);
  }, [preview, active.base, active.vars, active.css]);
  const reloadThemes = async (select?: CustomTheme) => {
    setCustomThemes(await api.themes());
    if (select) setThemeId(`custom:${select.id}`);
  };
  const closeEditor = () => {
    setEditing(null);
    setPreview(null);
  };
  const [scheme, setScheme] = useEvaScheme();
  const [bg, setBg] = useBackground();
  const [funOpen, setFunOpen] = useState(() => {
    try {
      return localStorage.getItem("fun-open") !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("fun-open", funOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [funOpen]);

  const reload = useCallback(async () => {
    const [p, a, c, l] = await Promise.all([api.providers(), api.agents(), api.chats(), api.links()]);
    setProviders(p);
    setAgents(a);
    setChats(c);
    setLinks(l);
    if (!p.length) setPage("providers");
    else if (!a.length) setPage((cur) => (cur === "chat" ? "agents" : cur));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!newAgent && agents.length) setNewAgent(agents[0].id);
  }, [agents, newAgent]);

  const createChat = async (agentId = newAgent) => {
    if (!agentId) return;
    const c = await api.createChat(agentId);
    setChats((cs) => [c, ...cs]);
    setChatId(c.id);
    setPage("chat");
  };

  const removeChat = async (id: string) => {
    if (!confirm("Удалить чат?")) return;
    await api.deleteChat(id);
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (chatId === id) setChatId(null);
  };

  const chat = chats.find((c) => c.id === chatId) ?? null;
  const agentById = (id: string) => agents.find((a) => a.id === id);

  return (
    <div className="shell">
    <BackgroundLayer bg={bg} />
    <StatusBar
      agents={agents.length}
      links={links.length}
      chats={chats.length}
      view={
        <ViewMenu
          themeId={themeId}
          setThemeId={setThemeId}
          theme={theme}
          custom={customThemes}
          onNewTheme={() =>
            setEditing({
              name: "Моя тема",
              base: active.base,
              vars: captureCurrentVars(),
              css: "",
            })
          }
          onEditTheme={(t) => setEditing({ ...t })}
          onThemesChanged={reloadThemes}
          scheme={scheme}
          setScheme={setScheme}
          bg={bg}
          setBg={setBg}
        />
      }
      funOpen={funOpen}
      onFun={() => setFunOpen((v) => !v)}
    />
    <div className="app">
      <aside className="sidebar" data-title="МЕНЮ">
        <div className="brand">
          <span className="logo">▣</span> AI HUB
        </div>
        <nav className="tabs">
          <button className={page === "chat" ? "active" : ""} onClick={() => setPage("chat")}>
            Чаты
          </button>
          <button className={page === "office" ? "active" : ""} onClick={() => setPage("office")}>
            Офис
          </button>
          <button className={page === "agents" ? "active" : ""} onClick={() => setPage("agents")}>
            Агенты
          </button>
          <button className={page === "providers" ? "active" : ""} onClick={() => setPage("providers")}>
            Провайдеры
          </button>
        </nav>

        <div className="new-chat">
          <select value={newAgent} onChange={(e) => setNewAgent(e.target.value)} disabled={!agents.length}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => createChat()} disabled={!agents.length}>
            + Чат
          </button>
        </div>

        <ul className="chat-list">
          {chats.map((c) => {
            const a = agentById(c.agent_id);
            return (
              <li
                key={c.id}
                className={c.id === chatId && page === "chat" ? "active" : ""}
                onClick={() => {
                  setChatId(c.id);
                  setPage("chat");
                }}
              >
                <span className="dot" style={{ background: a?.color ?? "#555" }} />
                <span className="title">{c.title}</span>
                <button
                  className="icon"
                  title="Удалить"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChat(c.id);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="main">
        {page === "providers" && <ProvidersPage providers={providers} onChange={reload} />}
        {page === "agents" && (
          <AgentsPage
            agents={agents}
            providers={providers}
            links={links}
            onChange={reload}
            openOffice={() => setPage("office")}
          />
        )}
        {page === "office" && (
          <OfficePage
            agents={agents}
            providers={providers}
            links={links}
            onChange={reload}
            openChat={(id) => createChat(id)}
            editAgent={() => setPage("agents")}
            theme={theme}
          />
        )}
        {page === "chat" &&
          (chat ? (
            <ChatView
              key={chat.id}
              chat={chat}
              agents={agents}
              onChatUpdated={(c) => setChats((cs) => cs.map((x) => (x.id === c.id ? c : x)))}
              onActivity={() => api.chats().then(setChats)}
            />
          ) : (
            <div className="empty">
              <h2>Выбери чат или создай новый</h2>
              <p>
                Агент — это модель + системный промпт + команда исполнителей. Настрой провайдеров и агентов
                на соседних вкладках.
              </p>
            </div>
          ))}
      </main>
      {funOpen && !editing && <FunPanel onClose={() => setFunOpen(false)} />}
      {editing && (
        <ThemeEditor
          key={editing.id ?? "new"}
          initial={editing}
          agents={agents}
          onPreview={setPreview}
          onSaved={async (t) => {
            closeEditor();
            await reloadThemes(t);
          }}
          onDeleted={async () => {
            closeEditor();
            setThemeId("dark");
            await reloadThemes();
          }}
          onClose={closeEditor}
        />
      )}
    </div>
    </div>
  );
}

function StatusBar({
  agents,
  links,
  chats,
  view,
  funOpen,
  onFun,
}: {
  agents: number;
  links: number;
  chats: number;
  view: React.ReactNode;
  funOpen: boolean;
  onFun: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return (
    <div className="statusbar">
      <span className="sb-name">AI·HUB</span>
      <span className="sb-item">
        АГЕНТЫ:<b>{agents}</b>
      </span>
      <span className="sb-item">
        СВЯЗИ:<b>{links}</b>
      </span>
      <span className="sb-item">
        ЧАТЫ:<b>{chats}</b>
      </span>
      <span className="sb-grow" />
      <span className="sb-clock">{stamp}</span>
      <button className={`sb-theme ${funOpen ? "on" : ""}`} onClick={onFun} title="Показать/скрыть панель отвлекалова">
        ОТВЛЕКАЛОВО:{funOpen ? "ВКЛ" : "ВЫКЛ"}
      </button>
      {view}
    </div>
  );
}
