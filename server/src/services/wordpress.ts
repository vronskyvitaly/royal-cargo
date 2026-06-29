export async function publishToWordPress(
  title: string,
  content: string
): Promise<string> {
  const url = process.env.WP_URL;
  const user = process.env.WP_USER;
  const password = process.env.WP_APP_PASSWORD;

  if (!url || !user || !password) {
    throw new Error("WordPress credentials not configured in .env");
  }

  const credentials = Buffer.from(`${user}:${password}`).toString("base64");

  const res = await fetch(`${url}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      title,
      content,
      status: "publish",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { link: string };
  return data.link;
}
