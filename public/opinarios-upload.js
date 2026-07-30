const API_URL = "/api/operacional/opinarios-upload";
const HOTEL_SLUG = "sueds-plaza";
const MAX_UPLOAD_BYTES = 3_800_000;
const TARGET_UPLOAD_BYTES = 1_800_000;
const MAX_IMAGE_EDGE = 2200;
const PREPARE_CONCURRENCY = 2;
const UPLOAD_CONCURRENCY = 3;
const MAX_UPLOAD_ATTEMPTS = 4;
const UPLOAD_TIMEOUT_MS = 55_000;

const state = {
  accessReady: false,
  photos: [],
  sending: false
};

function byId(id) {
  return document.getElementById(id);
}

function setMessage(targetId, message, type = "") {
  const target = byId(targetId);
  target.textContent = message;
  target.className = `status-message${type ? ` ${type}` : ""}`;
}

function todayLocal() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateLabel(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function makeUploadId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  const values = crypto.getRandomValues(new Uint8Array(16));
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runPool(items, concurrency, task) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(items[index], index);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
}

async function startUploadSession() {
  const response = await fetch(API_URL, { credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Nao foi possivel conectar ao envio.");
  }
  state.accessReady = true;
  renderQueue();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel abrir esta foto."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Nao foi possivel preparar esta foto.")), "image/jpeg", quality);
  });
}

async function preparePhoto(file) {
  const image = await loadImage(file);
  let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  let quality = 0.84;
  let blob;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasBlob(canvas, quality);
    if (blob.size <= TARGET_UPLOAD_BYTES) break;
    quality = Math.max(0.68, quality - 0.08);
    scale *= 0.92;
  }

  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error("A foto ficou muito grande para envio.");
  return blob;
}

async function addFiles(fileList) {
  if (state.sending) return;
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  const firstNewIndex = state.photos.length;
  const newPhotos = files.map((file, index) => ({
      id: makeUploadId(),
      originalName: file.name || `opinario-${firstNewIndex + index + 1}.jpg`,
      source: file,
      blob: null,
      previewUrl: URL.createObjectURL(file),
      status: "preparing",
      message: "Aguardando preparo...",
      attempts: 0
    }));
  state.photos.push(...newPhotos);
  renderQueue();

  await runPool(newPhotos, PREPARE_CONCURRENCY, async (photo) => {
    photo.message = "Preparando...";
    renderQueue();
    try {
      photo.blob = await preparePhoto(photo.source);
      photo.status = "ready";
      photo.message = `Pronta - ${formatBytes(photo.blob.size)}`;
    } catch (error) {
      photo.status = "failed";
      photo.message = error.message;
    }
    renderQueue();
  });
}

function removePhoto(id) {
  const index = state.photos.findIndex((photo) => photo.id === id);
  if (index === -1) return;
  URL.revokeObjectURL(state.photos[index].previewUrl);
  state.photos.splice(index, 1);
  renderQueue();
}

function clearPhotos() {
  state.photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  state.photos = [];
  setMessage("uploadMessage", "");
  renderQueue();
}

function renderQueue() {
  const queue = byId("photoQueue");
  const template = byId("photoTemplate");
  const activeIds = new Set(state.photos.map((photo) => photo.id));
  [...queue.children].forEach((node) => {
    if (!activeIds.has(node.dataset.photoId)) node.remove();
  });

  state.photos.forEach((photo, index) => {
    let node = queue.querySelector(`[data-photo-id="${photo.id}"]`);
    if (!node) {
      node = template.content.firstElementChild.cloneNode(true);
      node.dataset.photoId = photo.id;
      node.querySelector("img").src = photo.previewUrl;
      node.querySelector(".remove-button").addEventListener("click", () => removePhoto(photo.id));
    }
    node.classList.toggle("sent", photo.status === "sent");
    node.classList.toggle("failed", photo.status === "failed");
    node.querySelector("strong").textContent = `Opinario ${index + 1}`;
    node.querySelector("span").textContent = photo.message;
    const removeButton = node.querySelector(".remove-button");
    removeButton.disabled = state.sending || photo.status === "sent";
    queue.appendChild(node);
  });

  const count = state.photos.length;
  const sent = state.photos.filter((photo) => photo.status === "sent").length;
  const failed = state.photos.filter((photo) => photo.status === "failed").length;
  const preparing = state.photos.some((photo) => photo.status === "preparing");
  byId("queueCount").textContent = count
    ? `${count} foto${count === 1 ? "" : "s"}${sent ? ` - ${sent} enviada${sent === 1 ? "" : "s"}` : ""}${failed ? ` - ${failed} com erro` : ""}`
    : "Nenhuma foto";
  byId("clearButton").disabled = state.sending || count === 0;
  byId("sendButton").disabled = state.sending || preparing || !state.accessReady || !state.photos.some((photo) => photo.status === "ready" || photo.status === "failed");
  refreshIcons();
}

async function uploadPhotoRequest(photo) {
  if (!photo.blob) photo.blob = await preparePhoto(photo.source);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    return await fetch(API_URL, {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "content-type": "image/jpeg",
        "x-upload-id": photo.id,
        "x-upload-attempt": String(photo.attempts),
        "x-hotel-slug": HOTEL_SLUG,
        "x-file-name": encodeURIComponent(photo.originalName),
        "x-uploader": encodeURIComponent(byId("uploaderName").value.trim()),
        "x-period-from": byId("periodFrom").value,
        "x-period-to": byId("periodTo").value
      },
      body: photo.blob
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function uploadPhoto(photo) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    photo.attempts += 1;
    try {
      let response = await uploadPhotoRequest(photo);
      if (response.status === 401 || response.status === 403) {
        state.accessReady = false;
        await startUploadSession();
        response = await uploadPhotoRequest(photo);
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const error = new Error(payload.message || `Falha no envio desta foto (HTTP ${response.status}).`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      return payload.photo;
    } catch (error) {
      lastError = error;
      const retryable = error.retryable !== false;
      if (!retryable || attempt === MAX_UPLOAD_ATTEMPTS) break;
      const delay = 1200 * (2 ** (attempt - 1)) + Math.round(Math.random() * 500);
      photo.message = `Falha temporaria. Nova tentativa em ${Math.ceil(delay / 1000)} s...`;
      renderQueue();
      await sleep(delay);
    }
  }
  throw lastError || new Error("Falha no envio desta foto.");
}

async function sendBatch() {
  const pending = state.photos.filter((photo) => photo.status === "ready" || photo.status === "failed");
  if (!pending.length) return;
  state.sending = true;
  byId("progressTrack").hidden = false;
  byId("progressBar").style.width = "0%";
  let sent = 0;
  let failed = 0;
  let completed = 0;
  let nextIndex = 0;
  renderQueue();

  async function uploadWorker() {
    while (nextIndex < pending.length) {
      const index = nextIndex;
      nextIndex += 1;
      const photo = pending[index];
      photo.status = "sending";
      photo.message = `Enviando ${index + 1} de ${pending.length}...`;
      setMessage("uploadMessage", `Enviando lote: ${completed} de ${pending.length} concluidas...`);
      renderQueue();
      try {
        const result = await uploadPhoto(photo);
        photo.status = "sent";
        photo.message = result.duplicate ? "Ja estava no Drive" : "Enviada ao Drive";
        sent += 1;
      } catch (error) {
        photo.status = "failed";
        photo.message = error.name === "AbortError"
          ? "Tempo esgotado apos tentativas automaticas."
          : error.message;
        failed += 1;
      }
      completed += 1;
      byId("progressBar").style.width = `${Math.round((completed / pending.length) * 100)}%`;
      setMessage("uploadMessage", `Enviando lote: ${completed} de ${pending.length} concluidas...`);
      renderQueue();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, () => uploadWorker())
  );

  state.sending = false;
  renderQueue();
  if (!failed) {
    setMessage("uploadMessage", `${sent} foto${sent === 1 ? " enviada" : "s enviadas"} com sucesso.`, "success");
  } else {
    setMessage(
      "uploadMessage",
      `${sent} enviada${sent === 1 ? "" : "s"}; ${failed} com erro mesmo apos as tentativas automaticas. Toque em Enviar lote apenas para repetir as que falharam.`,
      "error"
    );
  }
}

function bindFileInput(id) {
  byId(id).addEventListener("change", async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
  });
}

async function init() {
  const today = todayLocal();
  byId("periodFrom").value = today;
  byId("periodTo").value = today;
  byId("batchDateLabel").textContent = `Lote de ${dateLabel(today)}`;
  bindFileInput("cameraInput");
  bindFileInput("galleryInput");
  byId("clearButton").addEventListener("click", clearPhotos);
  byId("sendButton").addEventListener("click", sendBatch);
  byId("periodFrom").addEventListener("change", () => {
    if (!byId("periodTo").value || byId("periodTo").value < byId("periodFrom").value) byId("periodTo").value = byId("periodFrom").value;
  });
  window.addEventListener("beforeunload", (event) => {
    if (!state.sending) return;
    event.preventDefault();
    event.returnValue = "";
  });
  refreshIcons();
  setMessage("uploadMessage", "Conectando ao envio...");
  try {
    await startUploadSession();
    setMessage("uploadMessage", "");
  } catch (error) {
    setMessage("uploadMessage", `${error.message} Recarregue a pagina para tentar novamente.`, "error");
  }
}

init();
