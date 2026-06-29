export async function publishToMegagroup(
  title: string,
  content: string
): Promise<string> {
  const apiUrl = process.env.MEGAGROUP_API_URL;
  const apiKey = process.env.MEGAGROUP_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error("Megagroup credentials not configured in .env");
  }

  const res = await fetch(`${apiUrl}/articles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ title, content }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Megagroup error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}
