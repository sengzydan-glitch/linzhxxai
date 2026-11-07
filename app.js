const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "jaccksallas-ai-v1";
const MAX_HISTORY = 30;

let threads = [];
let activeThreadId = null;
let pendingImage = null;
let codeMode = false;
let busy = false;
let toastTimer;

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

function loadThreads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    threads = Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    threads = [];
  }
  if (threads.length) {
    activeThreadId = threads[0].id;
  } else {
    createThread(false);
  }
}

function persistThreads() {
  // Images are intentionally not persisted to avoid filling browser storage.
  const safe = threads.slice(0, MAX_HISTORY).map(thread => ({
    ...thread,
    messages: thread.messages.map(({ imageData, ...message }) => ({
      ...message,
      imageName: imageData ? (message.imageName || "Gambar sebelumnya") : message.imageName
    }))
  }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    toast("Penyimpanan browser penuh. Hapus sebagian riwayat.");
  }
}

function activeThread() {
  return threads.find(thread => thread.id === activeThreadId);
}

function createThread(shouldRender = true) {
  const thread = { id: uid(), title: "Percakapan baru", updatedAt: Date.now(), messages: [] };
  threads.unshift(thread);
  activeThreadId = thread.id;
  pendingImage = null;
  $("messageInput").value = "";
  $("messageInput").style.height = "auto";
  clearAttachment();
  if (shouldRender) renderAll();
  persistThreads();
  return thread;
}

function setBusy(value) {
  busy = value;
  $("sendBtn").disabled = value;
  $("messageInput").disabled = value;
  $("typingRow").classList.toggle("hidden", !value);
  if (value) scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => $("bottomAnchor").scrollIntoView({ behavior: "smooth", block: "end" }));
}

function renderAll() {
  renderHistory();
  renderMessages();
  $("codeModeBtn").classList.toggle("active", codeMode);
  $("codePill").classList.toggle("hidden", !codeMode);
  $("modeLabel").textContent = codeMode ? "Coding assistant" : "General chat";
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  threads.forEach(thread => {
    const button = document.createElement("button");
    button.className = "history-item" + (thread.id === activeThreadId ? " selected" : "");
    const icon = document.createElement("span");
    icon.className = "history-icon";
    icon.textContent = "◌";
    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = thread.title || "Percakapan baru";
    button.append(icon, title);
    button.addEventListener("click", () => {
      activeThreadId = thread.id;
      pendingImage = null;
      clearAttachment();
      renderAll();
      closeSidebar();
    });
    list.appendChild(button);
  });
}

function renderMessages() {
  const thread = activeThread();
  const messages = thread ? thread.messages : [];
  $("welcome").classList.toggle("hidden", messages.length > 0);
  const container = $("messages");
  container.innerHTML = "";
  messages.forEach(message => {
    const row = document.createElement("article");
    row.className = `message ${message.role}`;
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = message.role === "user" ? "U" : "J";

    const body = document.createElement("div");
    body.className = "msg-body";
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const name = document.createElement("strong");
    name.textContent = message.role === "user" ? "YOU" : "JACCKSALLAS AI";
    const time = document.createElement("span");
    time.textContent = new Date(message.createdAt || Date.now()).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    meta.append(name, time);

    const content = document.createElement("div");
    content.className = "msg-content";

    if (message.imageData) {
      const img = document.createElement("img");
      img.className = "msg-image";
      img.src = message.imageData;
      img.alt = message.imageName || "Gambar yang diunggah";
      content.appendChild(img);
    } else if (message.imageName) {
      const note = document.createElement("p");
      note.className = "image-note";
      note.textContent = `▧ ${message.imageName} (gambar tidak disimpan setelah halaman dimuat ulang)`;
      content.appendChild(note);
    }

    const text = document.createElement("div");
    text.innerHTML = renderMarkdown(message.content || "");
    content.appendChild(text);

    body.append(meta, content);

    if (message.role === "assistant" && message.content) {
      const actions = document.createElement("div");
      actions.className = "msg-actions";
      const copy = document.createElement("button");
      copy.textContent = "▢ Salin jawaban";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(message.content); toast("Jawaban disalin."); }
        catch { toast("Clipboard tidak tersedia di browser ini."); }
      });
      actions.appendChild(copy);
      body.appendChild(actions);
    }

    row.append(avatar, body);
    container.appendChild(row);
  });
  scrollToBottom();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderMarkdown(source) {
  let text = escapeHtml(source);
  const blocks = [];
  text = text.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const index = blocks.length;
    blocks.push(`<div class="code-block"><span class="code-lang">${escapeHtml(lang || "code")}</span><button class="copy-code" data-code-index="${index}">Copy</button><pre><code>${code.replace(/\n$/, "")}</code></pre></div>`);
    return `@@CODEBLOCK${index}@@`;
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");

  const lines = text.split("\n");
  const output = [];
  let inList = false;
  let listType = "";
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${paragraph.join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (inList) { output.push(`</${listType}>`); inList = false; listType = ""; }
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      output.push(`<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`);
    } else if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!inList || listType !== type) { closeList(); output.push(`<${type}>`); inList = true; listType = type; }
      output.push(`<li>${(unordered || ordered)[1]}</li>`);
    } else if (!line.trim()) {
      flushParagraph(); closeList();
    } else {
      closeList(); paragraph.push(line);
    }
  }
  flushParagraph(); closeList();
  let html = output.join("");
  blocks.forEach((block, index) => { html = html.replace(`@@CODEBLOCK${index}@@`, block); });
  return html;
}

function attachCodeCopyHandlers() {
  document.querySelectorAll(".copy-code").forEach(button => {
    button.addEventListener("click", async () => {
      const code = button.parentElement.querySelector("code")?.textContent || "";
      try { await navigator.clipboard.writeText(code); toast("Kode disalin."); }
      catch { toast("Clipboard tidak tersedia."); }
    });
  });
}

function clearAttachment() {
  pendingImage = null;
  $("imageInput").value = "";
  $("attachmentPreview").classList.add("hidden");
}

async function resizeImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Format gambar harus JPG, PNG, atau WebP.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 12 MB.");
  const source = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("Gagal memproses gambar.");
  if (blob.size > 3 * 1024 * 1024) throw new Error("Gambar masih terlalu besar. Pilih gambar yang lebih kecil.");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Gagal membaca gambar."));
    reader.readAsDataURL(blob);
  });
}

async function selectImage(file) {
  try {
    const data = await resizeImage(file);
    pendingImage = { data, name: file.name || "image.jpg" };
    $("attachmentThumb").src = data;
    $("attachmentName").textContent = pendingImage.name;
    $("attachmentPreview").classList.remove("hidden");
    toast("Gambar siap dikirim.");
  } catch (error) {
    toast(error.message);
  }
}

function makeTitle(text) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 34 ? clean.slice(0, 33) + "…" : clean || "Percakapan baru";
}

async function sendMessage(prefill = null) {
  if (busy) return;
  const text = (prefill ?? $("messageInput").value).trim();
  if (!text && !pendingImage) return;

  const thread = activeThread() || createThread(false);
  const userMessage = {
    id: uid(), role: "user",
    content: text || "Tolong analisis gambar ini.",
    imageData: pendingImage?.data || null,
    imageName: pendingImage?.name || null,
    createdAt: Date.now()
  };
  thread.messages.push(userMessage);
  if (thread.messages.length === 1) thread.title = makeTitle(userMessage.content);
  thread.updatedAt = Date.now();

  $("messageInput").value = "";
  $("messageInput").style.height = "auto";
  clearAttachment();
  renderAll();
  setBusy(true);

  const assistantMessage = { id: uid(), role: "assistant", content: "", createdAt: Date.now() };
  thread.messages.push(assistantMessage);
  renderMessages();

  try {
    const payloadMessages = thread.messages
      .filter(message => message.role === "user" || message.role === "assistant")
      .slice(-14)
      .filter(message => message.content)
      .map(message => ({
        role: message.role,
        content: message.content,
        ...(message.imageData ? { imageData: message.imageData } : {})
      }));

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payloadMessages, mode: codeMode ? "code" : "general" })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request gagal (${response.status}).`);
    assistantMessage.content = data.reply || "Model tidak mengembalikan teks.";
  } catch (error) {
    assistantMessage.content = `**Terjadi kesalahan.**\n\n${error.message}\n\nPeriksa koneksi internet, konfigurasi API key di Vercel, dan model yang dipilih pada environment variable.`;
  } finally {
    thread.updatedAt = Date.now();
    threads.sort((a, b) => b.updatedAt - a.updatedAt);
    persistThreads();
    setBusy(false);
    renderAll();
    attachCodeCopyHandlers();
  }
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("mobileScrim").classList.remove("show");
}

$("newChatBtn").addEventListener("click", () => { createThread(); closeSidebar(); });
$("newChatTop").addEventListener("click", () => createThread());
$("clearHistoryBtn").addEventListener("click", () => {
  if (!confirm("Hapus seluruh riwayat chat dari browser ini?")) return;
  threads = [];
  createThread();
  toast("Riwayat chat dihapus.");
});
$("allChatsBtn").addEventListener("click", () => { codeMode = false; renderAll(); closeSidebar(); });
$("codeModeNav").addEventListener("click", () => { codeMode = true; renderAll(); closeSidebar(); toast("Coding assistant aktif."); });
$("codeModeBtn").addEventListener("click", () => {
  codeMode = !codeMode;
  renderAll();
  toast(codeMode ? "Coding assistant aktif." : "General chat aktif.");
});
$("sendBtn").addEventListener("click", () => sendMessage());
$("messageInput").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
$("messageInput").addEventListener("input", () => {
  const input = $("messageInput");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 170) + "px";
});
$("attachBtn").addEventListener("click", () => $("imageInput").click());
$("imageInput").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) selectImage(file);
});
$("removeAttachment").addEventListener("click", clearAttachment);
$("openSidebar").addEventListener("click", () => {
  $("sidebar").classList.add("open");
  $("mobileScrim").classList.add("show");
});
$("closeSidebar").addEventListener("click", closeSidebar);
$("mobileScrim").addEventListener("click", closeSidebar);
document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

loadThreads();
renderAll();
attachCodeCopyHandlers();
