// netlify/functions/gemini.mjs
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server missing GEMINI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const careful = Boolean(body.careful);

    if (!prompt || prompt.length > 6000) {
      return new Response(JSON.stringify({ error: "Invalid prompt length" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const model = careful ? "gemini-2.5-pro" : "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: careful ? 0.1 : 0.2
        }
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: data?.error?.message || "Upstream AI error" }),
        { status: upstream.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Proxy error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
