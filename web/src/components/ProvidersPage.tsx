import { useState } from "react";
import type { Provider, ProviderKind } from "../../../shared/types.ts";
import { PROVIDER_KINDS, PROVIDER_PRESETS } from "../../../shared/providers.ts";
import { api } from "../api.ts";

const PRESETS = PROVIDER_PRESETS;

export function ProvidersPage({ providers, onChange }: { providers: Provider[]; onChange: () => void }) {
  const [editing, setEditing] = useState<string | "new" | null>(providers.length ? null : "new");
  const [form, setForm] = useState({ name: "", kind: "anthropic" as ProviderKind, base_url: "", api_key: "" });
  const [hint, setHint] = useState(PRESETS[0].hint);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Record<string, string>>({});

  const startNew = (i = 0) => {
    const p = PRESETS[i];
    setForm({ name: p.name, kind: p.kind, base_url: p.base_url, api_key: "" });
    setHint(p.hint);
    setEditing("new");
    setError(null);
  };

  const startEdit = (p: Provider) => {
    setForm({ name: p.name, kind: p.kind, base_url: p.base_url ?? "", api_key: "" });
    setHint(p.has_key ? "Ключ сохранён. Оставь поле пустым, чтобы не менять." : "");
    setEditing(p.id);
    setError(null);
  };

  const save = async () => {
    try {
      if (editing === "new") await api.createProvider(form);
      else if (editing) await api.updateProvider(editing, form);
      setEditing(null);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (p: Provider) => {
    if (!confirm(`Удалить провайдера «${p.name}» и всех его агентов?`)) return;
    await api.deleteProvider(p.id);
    onChange();
  };

  const check = async (p: Provider) => {
    setModels((m) => ({ ...m, [p.id]: "проверяю…" }));
    const r = await api.models(p.id);
    setModels((m) => ({
      ...m,
      [p.id]: r.error ? `ошибка: ${r.error}` : `OK, моделей: ${r.models.length} — ${r.models.slice(0, 8).join(", ")}${r.models.length > 8 ? "…" : ""}`,
    }));
  };

  return (
    <div className="page">
      <h1>Провайдеры</h1>
      <p className="muted">
        Подключение к API. Один провайдер — один ключ; агентов на нём можно завести сколько угодно. Ключи хранятся
        локально в <code>data/ai-hub.db</code> и в браузер не отдаются.
      </p>

      <div className="grid">
        {providers.map((p) => (
          <div key={p.id} className="item">
            <div className="item-head">
              <b>{p.name}</b>
              <span className="badge" title={PROVIDER_KINDS[p.kind]?.label}>{p.kind}</span>
            </div>
            <div className="muted small">{p.base_url || "по умолчанию"}</div>
            <div className="muted small">ключ: {p.has_key ? "задан" : "нет"}</div>
            {models[p.id] && <div className="small check">{models[p.id]}</div>}
            <div className="actions">
              <button onClick={() => check(p)}>Проверить</button>
              <button onClick={() => startEdit(p)}>Изменить</button>
              <button className="danger" onClick={() => remove(p)}>
                Удалить
              </button>
            </div>
          </div>
        ))}
        <div className="item add" onClick={() => startNew()}>
          + Добавить провайдера
        </div>
      </div>

      {editing && (
        <div className="form">
          <h2>{editing === "new" ? "Новый провайдер" : "Изменить провайдера"}</h2>
          {editing === "new" && (
            <div className="presets">
              {PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => startNew(i)} className={form.name === p.name && form.kind === p.kind ? "active" : ""}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <label>
            Название
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Тип API
            <select
              value={form.kind}
              disabled={editing !== "new"}
              onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderKind })}
            >
              {Object.entries(PROVIDER_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input
              value={form.base_url}
              placeholder="по умолчанию"
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            />
          </label>
          <label>
            API-ключ
            <input
              type="password"
              value={form.api_key}
              autoComplete="off"
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            />
          </label>
          {hint && <div className="muted small">{hint}</div>}
          <div className="muted small">{PROVIDER_KINDS[form.kind]?.hint}</div>
          {error && <div className="error-line">{error}</div>}
          <div className="actions">
            <button className="primary" onClick={save}>
              Сохранить
            </button>
            <button onClick={() => setEditing(null)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
