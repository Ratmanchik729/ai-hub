import { useEffect, useState } from "react";
import type { Agent, Effort, Link, Provider } from "../../../shared/types.ts";
import { PROVIDER_KINDS, PROVIDER_PRESETS } from "../../../shared/providers.ts";
import { api } from "../api.ts";

import { AGENT_COLORS as COLORS } from "../theme.ts";

// Нейтральные шаблоны ролей — отправная точка, промпты правь под свои задачи.
const TEMPLATES: { label: string; name: string; description: string; system_prompt: string }[] = [
  {
    label: "Руководитель",
    name: "Руководитель",
    description: "Разбирает задачу, планирует, раздаёт подзадачи команде и собирает итог.",
    system_prompt:
      "Ты — руководитель команды агентов. Разбери задачу пользователя, составь план, " +
      "поручи подзадачи подходящим исполнителям, проверь их результаты и дай итоговый ответ. " +
      "Отвечай на языке пользователя.",
  },
  {
    label: "Исполнитель",
    name: "Исполнитель",
    description: "Выполняет конкретную поставленную задачу и возвращает результат.",
    system_prompt:
      "Ты — исполнитель. Выполни поставленную задачу точно и полностью. " +
      "В конце дай краткий итог: что сделано, результат, что осталось неясным.",
  },
  {
    label: "Ревьюер",
    name: "Ревьюер",
    description: "Проверяет чужой результат: ищет ошибки, пробелы и недоказанные утверждения.",
    system_prompt:
      "Ты — ревьюер. Критически проверь присланный результат: найди ошибки, пробелы " +
      "и утверждения без подтверждения. Дай список замечаний по важности.",
  },
];

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

type Form = Omit<Agent, "id" | "created_at">;

function emptyForm(providers: Provider[]): Form {
  return {
    name: "",
    description: "",
    provider_id: providers[0]?.id ?? "",
    model: "",
    system_prompt: "",
    effort: "high",
    temperature: null,
    max_tokens: null,
    x: null,
    y: null,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

export function AgentsPage({
  agents,
  providers,
  links,
  onChange,
  openOffice,
}: {
  agents: Agent[];
  providers: Provider[];
  links: Link[];
  onChange: () => void;
  openOffice: () => void;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(providers));
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === form.provider_id);
  const knobs = provider ? PROVIDER_KINDS[provider.kind]?.knobs : undefined;
  const exampleModel =
    PROVIDER_PRESETS.find((p) => p.kind === provider?.kind && p.base_url === (provider?.base_url ?? ""))?.example_model ??
    PROVIDER_PRESETS.find((p) => p.kind === provider?.kind)?.example_model ??
    "";

  useEffect(() => {
    if (!editing || !form.provider_id) return;
    let cancelled = false;
    api.models(form.provider_id).then((r) => {
      if (!cancelled) setModels(r.models);
    });
    return () => {
      cancelled = true;
    };
  }, [editing, form.provider_id]);

  const startNew = () => {
    setForm(emptyForm(providers));
    setEditing("new");
    setError(null);
  };

  const startEdit = (a: Agent) => {
    const { id, created_at, ...rest } = a;
    setForm(rest);
    setEditing(a.id);
    setError(null);
  };

  const save = async () => {
    try {
      const body = {
        ...form,
        effort: knobs === "effort" ? form.effort : null,
        temperature: knobs === "temperature" ? form.temperature : null,
      };
      if (editing === "new") await api.createAgent(body);
      else if (editing) await api.updateAgent(editing, body);
      setEditing(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (a: Agent) => {
    if (!confirm(`Удалить агента «${a.name}» и его чаты?`)) return;
    await api.deleteAgent(a.id);
    onChange();
  };

  const nameOf = (id: string) => agents.find((x) => x.id === id)?.name;

  if (!providers.length) {
    return (
      <div className="page">
        <h1>Агенты</h1>
        <p>Сначала добавь хотя бы одного провайдера.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Агенты</h1>
      <p className="muted">
        Агент = модель + системный промпт + настройки. Кто кем руководит и кто с кем общается — настраивается в{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); openOffice(); }}>Офисе</a>.
      </p>

      <div className="grid">
        {agents.map((a) => {
          const p = providers.find((x) => x.id === a.provider_id);
          const subs = links.filter((l) => l.kind === "manages" && l.from_agent === a.id).map((l) => nameOf(l.to_agent));
          const bosses = links.filter((l) => l.kind === "manages" && l.to_agent === a.id).map((l) => nameOf(l.from_agent));
          return (
            <div key={a.id} className="item">
              <div className="item-head">
                <span className="dot" style={{ background: a.color }} />
                <b>{a.name}</b>
              </div>
              <div className="muted small">
                {p?.name ?? "?"} · {a.model}
              </div>
              {a.description && <div className="small">{a.description}</div>}
              {bosses.length > 0 && <div className="small">Руководитель: {bosses.join(", ")}</div>}
              {subs.length > 0 && <div className="small">Подчинённые: {subs.join(", ")}</div>}
              <div className="actions">
                <button onClick={() => startEdit(a)}>Изменить</button>
                <button className="danger" onClick={() => remove(a)}>
                  Удалить
                </button>
              </div>
            </div>
          );
        })}
        <div className="item add" onClick={startNew}>
          + Добавить агента
        </div>
      </div>

      {editing && (
        <div className="form">
          <h2>{editing === "new" ? "Новый агент" : "Изменить агента"}</h2>
          {editing === "new" && (
            <div className="presets">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() =>
                    setForm((f) => ({ ...f, name: t.name, description: t.description, system_prompt: t.system_prompt }))
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <label className="grow">
              Имя
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Цвет
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </label>
          </div>
          <label>
            Описание роли (его видит руководитель)
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="row">
            <label className="grow">
              Провайдер
              <select
                value={form.provider_id}
                onChange={(e) => setForm({ ...form, provider_id: e.target.value, model: "" })}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grow">
              Модель
              <input
                list="models"
                value={form.model}
                placeholder={exampleModel}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
              <datalist id="models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="row">
            {knobs === "effort" ? (
              <label>
                Effort (глубина рассуждений)
                <select
                  value={form.effort ?? ""}
                  onChange={(e) => setForm({ ...form, effort: (e.target.value || null) as Effort | null })}
                >
                  {provider?.kind !== "anthropic" && <option value="">выкл (не reasoning-модель)</option>}
                  {EFFORTS.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Temperature
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={form.temperature ?? ""}
                  placeholder="по умолчанию"
                  onChange={(e) =>
                    setForm({ ...form, temperature: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </label>
            )}
            <label>
              Max tokens
              <input
                type="number"
                value={form.max_tokens ?? ""}
                placeholder="по умолчанию"
                onChange={(e) => setForm({ ...form, max_tokens: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Системный промпт
            <textarea
              rows={8}
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            />
          </label>
          {error && <div className="error-line">{error}</div>}
          <div className="actions">
            <button className="primary" onClick={save} disabled={!form.name || !form.model}>
              Сохранить
            </button>
            <button onClick={() => setEditing(null)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
