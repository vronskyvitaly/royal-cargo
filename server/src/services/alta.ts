import crypto from "crypto";

const LOGIN = process.env.ALTA_LOGIN ?? "sa67948";
const PASSWORD = process.env.ALTA_PASSWORD ?? "1K8upUi9";

function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

function authSecret(tncode: string): string {
  return md5(`${tncode}:${LOGIN}:${md5(PASSWORD)}`);
}

function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

export interface TnvedInfo {
  code: string;
  name: string;
  dutyRate: string;
  vatRate: string;
  permits: string[];
}

export interface AltaDoc {
  title: string;
  url: string;
}

/** Extract first HS code (ТН ВЭД) from transcript text, 4–10 digits */
export function extractTnvedCode(text: string): string | null {
  const m = text.match(/\b(\d[\d\s]{8,13}\d)\b/);
  if (!m) return null;
  const clean = m[1].replace(/\D/g, "").slice(0, 10);
  return clean.length >= 4 ? clean : null;
}

/** Duty rate and VAT from Alta Такса API */
export async function fetchTnvedRates(code: string): Promise<Omit<TnvedInfo, "permits"> | null> {
  try {
    const params = new URLSearchParams({ tncode: code, login: LOGIN, secret: authSecret(code) });
    const r = await fetch(`https://www.alta.ru/tnved/xml/?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;

    const xml = await r.text();
    if (xml.includes("<Error>")) return null;

    const name = xmlText(xml, "Name");

    // First duty rate entry
    const dutyMatch = xml.match(/<Duty[^>]*>[\s\S]*?<Rate>([^<]+)<\/Rate>[\s\S]*?(?:<Unit>([^<]*)<\/Unit>)?/i);
    const dutyRate = dutyMatch ? (dutyMatch[2] ? `${dutyMatch[1].trim()} ${dutyMatch[2].trim()}` : dutyMatch[1].trim()) : "";

    // VAT rate
    const vatRate = xmlText(xml, "NdsRate") || xmlText(xml, "VatRate") || xmlText(xml, "Rate");

    return { code, name, dutyRate, vatRate };
  } catch (err) {
    console.error("Alta TNVED rates error:", err);
    return null;
  }
}

/** Non-tariff regulations (permits, certificates) from Alta xml_nodes API */
export async function fetchTnvedPermits(code: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ tncode: code, login: LOGIN, secret: authSecret(code) });
    const r = await fetch(`https://www.alta.ru/tnved/xml_nodes/?${params}`, {
      signal: AbortSignal.timeout(18_000),
    });
    if (!r.ok) return [];

    const xml = await r.text();
    const names: string[] = [];
    const pattern = /<(?:Name|NodeName)>([^<]+)<\/(?:Name|NodeName)>/gi;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(xml)) !== null) {
      const name = m[1].trim();
      if (name.length > 3) names.push(name);
    }

    return [...new Set(names)].slice(0, 6);
  } catch (err) {
    console.error("Alta NTR permits error:", err);
    return [];
  }
}

/** Search alta.ru/tamdoc for laws by subject (used when no HS code in transcript) */
export async function fetchRelevantLaws(subject: string): Promise<AltaDoc[]> {
  try {
    const query = encodeURIComponent(subject);
    const r = await fetch(`https://www.alta.ru/tamdoc/?q=${query}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RoyalCargo/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return [];

    const html = await r.text();
    const pattern = /<a\s+href="(\/tamdoc\/[a-z0-9]+\/)"[^>]*>([\s\S]*?)<\/a>/gi;
    const docs: AltaDoc[] = [];
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(html)) !== null && docs.length < 8) {
      const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (title.length < 15) continue;
      docs.push({ title, url: `https://www.alta.ru${m[1]}` });
    }

    return docs;
  } catch (err) {
    console.error("Alta tamdoc error:", err);
    return [];
  }
}
