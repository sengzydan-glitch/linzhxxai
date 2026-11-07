
// JavaScript | api/chat.js | Vercel Node.js Function | Google Gemini API

const MAX_MESSAGES = 14;
const MAX_TEXT_LENGTH = 12000;
const MAX_IMAGE_DATA_LENGTH = 3_800_000;

function sendJson(res, status, payload) {
  res.status(status).setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(payload));
}

function parseImageDataUrl(value) {
  if (
    typeof value !== "string" ||
    value.length > MAX_IMAGE_DATA_LENGTH
  ) {
    return null;
  }

  const match = value.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/
  );

  if (!match) return null;

  return {
    mimeType: `image/${match[1]}`,
    data: match[2]
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Pesan tidak ditemukan.");
  }

  const recentMessages = messages.slice(-MAX_MESSAGES);

  return recentMessages.map((message, index) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role)
    ) {
      throw new Error("Format pesan tidak valid.");
    }

    const content =
      typeof message.content === "string"
        ? message.content.trim()
        : "";

    if (content.length > MAX_TEXT_LENGTH) {
      throw new Error(
        "Pesan terlalu panjang. Batas 12.000 karakter."
      );
    }

    const parts = [];

    if (content) {
      parts.push({ text: content });
    }

    if (message.imageData != null) {
      if (
        message.role !== "user" ||
        index !== recentMessages.length - 1
      ) {
        throw new Error(
          "Gambar hanya boleh dilampirkan pada pesan pengguna terbaru."
        );
      }

      const image = parseImageDataUrl(message.imageData);

      if (!image) {
        throw new Error(
          "Data gambar tidak valid. Gunakan JPG, PNG, atau WebP."
        );
      }

      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }

    if (parts.length === 0) return null;

    return {
      role: message.role === "assistant" ? "model" : "user",
      parts
    };
  }).filter(Boolean);
}

function extractText(data) {
  const candidates = data?.candidates || [];

  const reply = candidates
    .flatMap(candidate => candidate?.content?.parts || [])
    .filter(part => typeof part.text === "string")
    .map(part => part.text)
    .join("")
    .trim();

  return reply;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendJson(res, 405, {
      error: "Method tidak didukung."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return sendJson(res, 500, {
      error: "GEMINI_API_KEY belum dipasang di Vercel Environment Variables."
    });
  }

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, {
        error: "JSON request tidak valid."
      });
    }
  }

  if (!body || typeof body !== "object") {
    return sendJson(res, 400, {
      error: "Request body tidak valid."
    });
  }

  let contents;

  try {
    contents = normalizeMessages(body.messages);
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message
    });
  }

  const mode = body.mode === "code" ? "code" : "general";

  const instructions = mode === "code"
    ? "Kamu adalah JACCKSALLAS AI, asisten pemrograman yang teliti dan ramah. Bantu pengguna merancang, menulis, menjelaskan, dan memperbaiki kode. Berikan kode lengkap yang relevan, jelaskan file dan cara menjalankannya, serta jangan mengarang hasil pengujian. Jawab dalam bahasa yang digunakan pengguna."
    : "Kamu adalah JACCKSALLAS AI, asisten AI serbaguna yang ramah, jelas, dan teliti. Jawab dalam bahasa yang digunakan pengguna. Untuk pertanyaan teknis, susun jawaban dengan langkah dan contoh yang berguna. Jika pengguna mengirim gambar, analisis isi gambar yang terlihat dan jelaskan batas ketidakpastian.";

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }]
        },
        contents,
        generationConfig: {
  maxOutputTokens: 1400
        }
        }
      }),
      signal: AbortSignal.timeout(55000)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const message =
        data?.error?.message ||
        `Gemini API error (${upstream.status}).`;

      return sendJson(res, upstream.status, {
        error: message
      });
    }

    const reply = extractText(data);

    if (!reply) {
      return sendJson(res, 502, {
        error:
          data?.promptFeedback?.blockReason
            ? `Permintaan diblokir: ${data.promptFeedback.blockReason}.`
            : "Gemini tidak mengembalikan teks. Coba kirim ulang pesan."
      });
    }

    return sendJson(res, 200, {
      reply,
      model
    });

  } catch (error) {
    const message =
      error.name === "TimeoutError"
        ? "Permintaan ke Gemini melewati batas waktu."
        : "Tidak dapat terhubung ke Google Gemini API.";

    return sendJson(res, 502, {
      error: message
    });
  }
}
