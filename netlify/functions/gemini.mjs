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

    // Tiered model candidates: primary fast model, then fallback models if 503/high-demand occurs
    const modelCandidates = careful
      ? ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
      : ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

    let lastError = null;
    let lastStatus = 500;

    for (let i = 0; i < modelCandidates.length; i++) {
      const model = modelCandidates[i];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

      // Try each model up to 2 times if we encounter 503 (high demand) or 429
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          // Brief pause before immediate retry on the same model
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        try {
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

          if (upstream.ok) {
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            return new Response(text, {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }

          lastStatus = upstream.status;
          lastError = data?.error?.message || "Upstream AI error";

          // If not 503 (service unavailable/high demand) or 429, don't keep retrying this model
          if (upstream.status !== 503 && upstream.status !== 429) {
            break;
          }
        } catch (fetchErr) {
          lastStatus = 500;
          lastError = fetchErr.message;
        }
      }
    }

    return new Response(
      JSON.stringify({ error: lastError || "All upstream model attempts exhausted" }),
      { status: lastStatus, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Proxy error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
