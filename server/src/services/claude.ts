import Anthropic from "@anthropic-ai/sdk";
import { fetchRelevantLaws } from "./alta.js";

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export async function generateArticle(
  transcriptRaw: string,
  subject: string
): Promise<{ title: string; content: string }> {
  const laws = await fetchRelevantLaws(subject);

  const lawsBlock =
    laws.length > 0
      ? `\n\nАктуальные нормативные документы по теме (источник: alta.ru — база таможенного законодательства):\n${laws
          .map((l, i) => `${i + 1}. ${l.title}\n   URL: ${l.url}`)
          .join("\n")}\n\nИспользуй эти документы как основу для ссылок на нормативные акты. Цитируй их точные названия, как они указаны выше.`
      : "";

  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Ты эксперт в области таможенного права и SEO-копирайтер компании "Royal Cargo" — таможенного брокера.
На основе транскрипта телефонного разговора напиши экспертную SEO-статью для сайта компании.

Тема звонка: ${subject}

Транскрипт:
${transcriptRaw}${lawsBlock}

Требования к статье:
- Язык: русский, официально-деловой стиль, без рекламных клише и воды
- Объём: 900–1200 слов
- Структура: заголовок H1, вводный абзац, 3–4 раздела с подзаголовками H2, заключение
- Тон: строгий, фактический, как у практикующего таможенного юриста — только конкретика
- Не упоминай имён клиентов и личных данных из звонка
- Используй реальные детали (тип груза, страна, услуга, код ТН ВЭД если известен) как SEO-ключи
- ОБЯЗАТЕЛЬНО: в тексте упоминай конкретные нормативные акты из списка выше (если он предоставлен), либо другие реально существующие акты по теме
- Ссылки на законы оформляй как кликабельные HTML-ссылки: <a href="URL документа на alta.ru" target="_blank"><strong>Название документа</strong></a>
- Верни ответ строго в JSON: {"title": "...", "content": "..."}
- В поле content используй HTML-теги: <h1>, <h2>, <p>, <strong>, <ul>, <li>, <a>`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude вернул неожиданный формат");

  return JSON.parse(jsonMatch[0]) as { title: string; content: string };
}
