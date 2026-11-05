// Генерация темы нейросетью: любой настроенный агент получает описание и возвращает JSON с переменными.
import { getAgent, getProvider } from "./db.ts";
import { adapterFor } from "./providers/index.ts";
import { extractJson, fillMissing, sanitizeTheme, themeGenerationPrompt, THEME_TOKENS, type CustomTheme } from "../shared/themes.ts";

export async function generateTheme(agentId: string, description: string): Promise<Omit<CustomTheme, "id"> & { missing: string[] }> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Агент не найден");
  const provider = getProvider(agent.provider_id);
  if (!provider) throw new Error("У агента нет провайдера");

  const result = await adapterFor(provider.kind).run({
    provider,
    // системный промпт агента не нужен — у генератора своя инструкция
    agent: { ...agent, effort: agent.effort ? "low" : null, max_tokens: agent.max_tokens ?? 8000 },
    system: themeGenerationPrompt(),
    history: [],
    userText: `Описание темы: ${description.slice(0, 1000)}`,
    tools: [],
    signal: AbortSignal.timeout(180_000),
    emit: () => {},
    callTool: async () => ({ output: "Инструменты недоступны", is_error: true }),
  });

  const raw = extractJson(result.text) as Record<string, unknown>;
  // Свой CSS от нейросети не принимаем — только проверенные переменные.
  const theme = sanitizeTheme({ ...raw, css: "" });
  if (Object.keys(theme.vars).length < 5) {
    throw new Error("Модель вернула слишком мало корректных значений — попробуй другую модель или переформулируй");
  }
  // недостающее выводим из того, что модель задала
  theme.vars = fillMissing(theme.vars);
  const missing = THEME_TOKENS.filter((t) => !(t.key in theme.vars)).map((t) => t.key);
  return { ...theme, missing };
}
