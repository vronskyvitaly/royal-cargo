import Anthropic from "@anthropic-ai/sdk";
import {
  extractTnvedCode,
  fetchTnvedRates,
  fetchTnvedPermits,
  fetchRelevantLaws,
} from "./alta.js";

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export async function generateArticle(
  transcriptRaw: string,
  subject: string
): Promise<{ title: string; content: string }> {
  let altaBlock = "";

  const tncode = extractTnvedCode(transcriptRaw);
  if (tncode) {
    // Have an HS code — get precise tariff data from Alta API
    const [rates, permits] = await Promise.all([
      fetchTnvedRates(tncode),
      fetchTnvedPermits(tncode),
    ]);

    if (rates) {
      const lines: string[] = [
        `\n\nДанные Alta Такса (alta.ru) для ТН ВЭД ${tncode}:`,
        rates.name ? `- Наименование товара: ${rates.name}` : "",
        rates.dutyRate ? `- Ставка ввозной таможенной пошлины: ${rates.dutyRate}` : "",
        rates.vatRate ? `- НДС: ${rates.vatRate}%` : "",
      ].filter(Boolean);

      if (permits.length > 0) {
        lines.push(`- Разрешительные документы (точные названия, используй как есть): ${permits.join("; ")}`);
      }

      lines.push(
        "\nИспользуй эти точные данные в статье. При упоминании ставки пошлины или НДС ссылайся на эти значения."
      );
      altaBlock = lines.join("\n");
    }
  } else {
    // No HS code — search tamdoc for relevant regulatory documents
    const laws = await fetchRelevantLaws(subject);
    if (laws.length > 0) {
      altaBlock =
        `\n\nАктуальные нормативные документы по теме (источник: alta.ru):\n` +
        laws.map((l, i) => `${i + 1}. ${l.title}\n   URL: ${l.url}`).join("\n") +
        `\n\nИспользуй эти документы как основу для ссылок. Цитируй их точные названия.`;
    }
  }

  const lawsBlock = altaBlock;

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
- Язык: русский, экспертный деловой стиль — без канцелярита, без пустых рекламных клише и воды, но живой и убедительный
- Заголовок (H1) и подзаголовки (H2) — «цепляющие» и конкретные: с реальными деталями из звонка (тип груза, страна, код ТН ВЭД, услуга) как SEO-ключами, отвечают на реальный поисковый запрос читателя, без общих фраз вроде «Всё о таможенном оформлении»
- Вводный абзац сразу обозначает проблему клиента и что он получит из статьи — цепляет с первых строк, но остаётся по делу
- Объём: 900–1200 слов
- Структура: H1 → вводный абзац → 3–4 раздела с H2 → ОБЯЗАТЕЛЬНЫЙ раздел «Какие документы потребуются» (или аналогичный заголовок по теме) → заключение с чётким следующим шагом для читателя
- Тон основного текста: строгий, фактический, как у практикующего таможенного юриста — только конкретика, никаких оценочных прилагательных без основания
- Не упоминай имён клиентов и личных данных из звонка

Раздел «Какие документы потребуются»:
- Оформляй как маркированный список <ul><li>, каждый пункт — <strong>точное официальное название документа</strong> и короткое пояснение зачем он нужен
- Если выше в промпте переданы точные названия разрешительных документов (из данных Alta Такса/alta.ru) — используй их дословно, с номером техрегламента если он указан. Не пиши расплывчато «уточним позже», если точные данные уже есть
- Обязательно включай базовый для темы набор (например, внешнеторговый контракт, инвойс/коммерческий счёт), даже если по звонку не упоминались, если они логически нужны для этого вида оформления
- Если точных данных о разрешительных документах нет — перечисли документы, реально типичные для этой категории товара/услуги, без выдумывания номеров регламентов

Источники и нормативные акты:
- ОБЯЗАТЕЛЬНО упоминай в тексте конкретные нормативные акты из списка выше (если он предоставлен), либо другие реально существующие акты по теме
- Ссылки на законы оформляй как кликабельные HTML-ссылки: <a href="URL документа на alta.ru" target="_blank"><strong>Название документа</strong></a>

Формат ответа:
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
