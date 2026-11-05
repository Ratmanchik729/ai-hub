// Каталог типов API и готовых пресетов провайдеров.
// Новый тип API = новый адаптер в server/providers/ + запись в PROVIDER_KINDS.

export const PROVIDER_KINDS = {
  anthropic: {
    label: "Anthropic Messages API",
    hint: "Claude. Рассуждения настраиваются через effort.",
    knobs: "effort",
  },
  openai: {
    label: "OpenAI Chat Completions (совместимый)",
    hint: "Самый распространённый формат: DeepSeek, Grok, Gemini, Mistral, Ollama, OpenRouter, vLLM…",
    knobs: "temperature",
  },
  "openai-responses": {
    label: "OpenAI Responses API",
    hint: "Новый API OpenAI: Codex-модели и reasoning-модели GPT. Effort = reasoning effort.",
    knobs: "effort",
  },
} as const;

export type ProviderKind = keyof typeof PROVIDER_KINDS;

export interface ProviderPreset {
  label: string;
  name: string;
  kind: ProviderKind;
  base_url: string;
  hint: string;
  example_model: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "Claude",
    name: "Anthropic",
    kind: "anthropic",
    base_url: "",
    hint: "Ключ: console.anthropic.com. Пусто — возьмётся ANTHROPIC_API_KEY из окружения.",
    example_model: "claude-opus-5-5",
  },
  {
    label: "ChatGPT / OpenAI",
    name: "OpenAI",
    kind: "openai",
    base_url: "https://api.openai.com/v1",
    hint: "Ключ: platform.openai.com → API keys.",
    example_model: "gpt-5",
  },
  {
    label: "OpenAI Codex (Responses)",
    name: "OpenAI Responses",
    kind: "openai-responses",
    base_url: "https://api.openai.com/v1",
    hint: "Для моделей, доступных только через Responses API (Codex и т.п.). Тот же ключ OpenAI.",
    example_model: "gpt-5-codex",
  },
  {
    label: "DeepSeek",
    name: "DeepSeek",
    kind: "openai",
    base_url: "https://api.deepseek.com",
    hint: "Ключ: platform.deepseek.com. Модели: deepseek-chat, deepseek-reasoner.",
    example_model: "deepseek-chat",
  },
  {
    label: "Grok (xAI)",
    name: "xAI",
    kind: "openai",
    base_url: "https://api.x.ai/v1",
    hint: "Ключ: console.x.ai.",
    example_model: "grok-4",
  },
  {
    label: "Gemini",
    name: "Google Gemini",
    kind: "openai",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    hint: "Ключ: aistudio.google.com. OpenAI-совместимый эндпоинт Gemini.",
    example_model: "gemini-2.5-pro",
  },
  {
    label: "Mistral",
    name: "Mistral",
    kind: "openai",
    base_url: "https://api.mistral.ai/v1",
    hint: "Ключ: console.mistral.ai.",
    example_model: "mistral-large-latest",
  },
  {
    label: "Groq",
    name: "Groq",
    kind: "openai",
    base_url: "https://api.groq.com/openai/v1",
    hint: "Быстрый инференс открытых моделей. Ключ: console.groq.com.",
    example_model: "llama-3.3-70b-versatile",
  },
  {
    label: "OpenRouter",
    name: "OpenRouter",
    kind: "openai",
    base_url: "https://openrouter.ai/api/v1",
    hint: "Один ключ — сотни моделей разных вендоров.",
    example_model: "anthropic/claude-opus-5-5",
  },
  {
    label: "Ollama (локально)",
    name: "Ollama",
    kind: "openai",
    base_url: "http://localhost:11434/v1",
    hint: "Ключ не нужен. Модели берутся из `ollama list`.",
    example_model: "qwen3:8b",
  },
  {
    label: "Другой (OpenAI-совм.)",
    name: "Custom",
    kind: "openai",
    base_url: "http://localhost:8000/v1",
    hint: "vLLM, LM Studio, llama.cpp server, корпоративный шлюз и т.п.",
    example_model: "",
  },
];
