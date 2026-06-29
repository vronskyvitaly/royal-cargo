import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export async function generateArticle(
  transcriptRaw: string,
  subject: string
): Promise<{ title: string; content: string }> {
  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Ты SEO-копирайтер для компании "Royal Cargo" — таможенного брокера.
На основе транскрипта телефонного разговора напиши полезную SEO-статью для сайта компании.

Тема звонка: ${subject}

Транскрипт:
${transcriptRaw}

Требования к статье:
- Язык: русский
- Объём: 600–900 слов
- Структура: заголовок H1, вводный абзац, 3–4 раздела с подзаголовками H2, заключение
- Тон: экспертный, полезный, без воды
- Не упоминай имён клиентов и личных данных из звонка
- Используй реальные детали (тип груза, страна, услуга) как основу для SEO-ключей
- Верни ответ строго в JSON: {"title": "...", "content": "..."}
- В поле content используй HTML-теги: <h1>, <h2>, <p>`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude вернул неожиданный формат");

  return JSON.parse(jsonMatch[0]) as { title: string; content: string };
}
