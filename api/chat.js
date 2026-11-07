// JavaScript | api/chat.js | Vercel Node.js Function | OpenAI Responses API
const MAX_MESSAGES = 14;
const MAX_TEXT_LENGTH = 12000;
const MAX_IMAGE_DATA_LENGTH = 3_800_000;

function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(payload));
}

function validImageDataUrl(value) {
  return typeof value === "string"
    && value.length <= MAX_IMAGE_DATA_LENGTH
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Pesan tidak ditemukan.");
  }

  return messages.slice(-MAX_MESSAGES).map((message, index) => {
    if (!message || !["user", "assistant"].includes(message.role)) {
      throw new Error("Format pesan tidak valid.");
    }

    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (content.length > MAX_TEXT_LENGTH) {
      throw new Error("Pesan terlalu panjang. Batas 12.000 karakter per pesan.");
    }

    const parts = [];
    if (content) parts.push({ type: "input_text", text: content });

    if (message.imageData !== undefined && message.imageData !== null) {
      if (message.role !== "user" || index !== messages.slice(-MAX_MESSAGES).length - 1) {
        throw new Error("Gambar hanya boleh dilampirkan pada pesan pengguna terbaru.");
      }
      if (!validImageDataUrl(message.imageData)) {
        throw new Error("Data gambar tidak valid atau terlalu besar. Gunakan JPG, PNG, atau WebP.");
      }
      parts.push({
        type: "input_image",
        image_url: message.imageData,
        detail: "auto"
      });
    }

    if (parts.length === 0) return null;
    return {
      role: message.role,
      content: parts.length === 1 && parts[0].type === "input_text" ? content : parts
    };
  }).filter(Boolean);
}

function extractText(responseData) {
  if (typeof responseData.output_text === "string" && responseData.output_text.trim()) {
    return responseData.output_text.trim();
  }
  const chunks = [];
  for (const item of responseData.output || []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.type === "output_text" && part.text) chunks.push(part.text);
        if (part.type === "refusal" && part.refusal) chunks.push(part.refusal);
      }
    }
  }
  return chunks.join("\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method tidak didukung." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error: "OPENAI_API_KEY belum dipasang di Vercel Project Settings → Environment Variables."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return sendJson(res, 400, { error: "JSON request tidak valid." }); }
  }
  if (!body || typeof body !== "object") {
    return sendJson(res, 400, { error: "Request body tidak valid." });
  }

  let input;
  try {
    input = normalizeMessages(body.messages);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const mode = body.mode === "code" ? "code" : "general";
  const instructions = mode === "code"
    ? "Kamu adalah JACCKSALLAS AI, asisten pemrograman yang teliti dan ramah. Bantu pengguna merancang, menulis, menjelaskan, dan memperbaiki kode. Berikan kode lengkap yang relevan, jelaskan file dan cara menjalankannya, serta jangan mengarang hasil pengujian. Jawab dalam bahasa yang digunakan pengguna."
    : "Kamu adalah JACCKSALLAS AI, asisten AI serbaguna yang ramah, jelas, dan teliti. Jawab dalam bahasa yang digunakan pengguna. Untuk pertanyaan teknis, susun jawaban dengan langkah dan contoh yang berguna. Jika pengguna mengirim gambar, analisis isi gambar yang terlihat dan jelaskan batas ketidakpastian.";

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        max_output_tokens: 1400,
        store: false
      }),
      signal: AbortSignal.timeout(55000)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const message = data?.error?.message || `OpenAI API error (${upstream.status}).`;
      const status = upstream.status === 401 ? 502 : upstream.status;
      return sendJson(res, status, { error: message });
    }

    const reply = extractText(data);
    if (!reply) {
      return sendJson(res, 502, { error: "Model tidak mengembalikan teks. Coba kirim ulang pesan." });
    }

    return sendJson(res, 200, { reply, model });
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "Permintaan ke AI melewati batas waktu. Coba lagi."
      : "Tidak dapat terhubung ke layanan AI. Periksa konfigurasi dan koneksi.";
    return sendJson(res, 502, { error: message });
  }
}
