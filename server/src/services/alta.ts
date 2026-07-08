export interface AltaDoc {
  title: string;
  url: string;
}

export async function fetchRelevantLaws(subject: string): Promise<AltaDoc[]> {
  try {
    const query = encodeURIComponent(subject);
    const response = await fetch(`https://www.alta.ru/tamdoc/?q=${query}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RoyalCargo/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Match document links: /tamdoc/<alphanumeric-code>/
    const pattern = /<a\s+href="(\/tamdoc\/[a-z0-9]+\/)"[^>]*>([\s\S]*?)<\/a>/gi;
    const docs: AltaDoc[] = [];
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(html)) !== null && docs.length < 8) {
      const href = m[1];
      const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (title.length < 15) continue;
      docs.push({ title, url: `https://www.alta.ru${href}` });
    }

    return docs;
  } catch (err) {
    console.error("Alta.ru fetch error:", err);
    return [];
  }
}
