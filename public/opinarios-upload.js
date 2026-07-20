const API_URL = "/api/operacional/opinarios-upload";
const HOTEL_SLUG = "sueds-plaza";
const MAX_UPLOAD_BYTES = 3_800_000;
const MAX_IMAGE_EDGE = 2400;

const state = {
  accessCode: sessionStorage.getItem("sueds-opinions-upload-token") || "",
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

function showUploadPanel() {
  byId("accessPanel").hidden = true;
  byId("uploadPanel").hidden = false;
  refreshIcons();
}

async function verifyAccess(code) {
  const response = await fetch(API_URL, { headers: { "x-upload-token": code } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    if (response.status === 401) throw new Error("Codigo de acesso incorreto.");
    throw new Error(payload.message || "Nao foi possivel validar o acesso.");
  }
  return payload;
}

async function handleAccess(event) {
  event.preventDefault();
  const button = byId("accessButton");
  const code = byId("accessCode").value.trim();
  button.disabled = true;
  setMessage("accessMessage", "Validando acesso...");
  try {
    await verifyAccess(code);
    state.accessCode = code;
    sessionStorage.setItem("sueds-opinions-upload-token", code);
    showUploadPanel();
  } catch (error) {
    setMessage("accessMessage", error.message, "error");
  } finally {
    button.disabled = false;
  }
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
  let quality = 0.92;
  let blob;

  for (let attempt = 0; attempt < 5; attempt += 1) {
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
    if (blob.size <= MAX_UPLOAD_BYTES) break;
    quality = Math.max(0.72, quality - 0.07);
    scale *= 0.88;
  }

  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error("A foto ficou muito grande para envio.");
  return blob;
}

async function addFiles(fileList) {
  const files = [...fileList];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const photo = {
      id: makeUploadId(),
      originalName: file.name || `opinario-${state.photos.length + 1}.jpg`,
      source: file,
      blob: null,
      previewUrl: URL.createObjectURL(file),
      status: "preparing",
      message: "Preparando..."
    };
    state.photos.push(photo);
    renderQueue();
    try {
      photo.blob = await preparePhoto(file);
      photo.status = "ready";
      photo.message = `Pronta - ${formatBytes(photo.blob.size)}`;
    } catch (error) {
      photo.status = "failed";
      photo.message = error.message;
    }
    renderQueue();
  }
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
  queue.innerHTML = "";
  state.photos.forEach((photo, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.toggle("sent", photo.status === "sent");
    node.classList.toggle("failed", photo.status === "failed");
    node.querySelector("img").src = photo.previewUrl;
    node.querySelector("strong").textContent = `Opinario ${index + 1}`;
    node.querySelector("span").textContent = photo.message;
    const removeButton = node.querySelector(".remove-button");
    removeButton.disabled = state.sending || photo.status === "sent";
    removeButton.addEventListener("click", () => removePhoto(photo.id));
    queue.appendChild(node);
  });

  const count = state.photos.length;
  byId("queueCount").textContent = count ? `${count} foto${count === 1 ? "" : "s"}` : "Nenhuma foto";
  byId("clearButton").disabled = state.sending || count === 0;
  byId("sendButton").disabled = state.sending || !state.photos.some((photo) => photo.status === "ready" || photo.status === "failed");
  refreshIcons();
}

async function uploadPhoto(photo) {
  if (!photo.blob) photo.blob = await preparePhoto(photo.source);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "x-upload-token": state.accessCode,
      "x-upload-id": photo.id,
      "x-hotel-slug": HOTEL_SLUG,
      "x-file-name": encodeURIComponent(photo.originalName),
      "x-uploader": encodeURIComponent(byId("uploaderName").value.trim()),
      "x-period-from": byId("periodFrom").value,
      "x-period-to": byId("periodTo").value
    },
    body: photo.blob
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem("sueds-opinions-upload-token");
      throw new Error("Codigo de acesso expirado ou incorreto.");
    }
    throw new Error(payload.message || "Falha no envio desta foto.");
  }
  return payload.photo;
}

async function sendBatch() {
  const pending = state.photos.filter((photo) => photo.status !== "sent");
  if (!pending.length) return;
  state.sending = true;
  byId("progressTrack").hidden = false;
  byId("progressBar").style.width = "0%";
  let sent = 0;
  let failed = 0;
  renderQueue();

  for (let index = 0; index < pending.length; index += 1) {
    const photo = pending[index];
    photo.status = "sending";
    photo.message = `Enviando ${index + 1} de ${pending.length}...`;
    setMessage("uploadMessage", `Enviando foto ${index + 1} de ${pending.length}...`);
    renderQueue();
    try {
      const result = await uploadPhoto(photo);
      photo.status = "sent";
      photo.message = result.duplicate ? "Ja estava no Drive" : "Enviada ao Drive";
      sent += 1;
    } catch (error) {
      photo.status = "failed";
      photo.message = error.message;
      failed += 1;
    }
    byId("progressBar").style.width = `${Math.round(((index + 1) / pending.length) * 100)}%`;
    renderQueue();
  }

  state.sending = false;
  renderQueue();
  if (!failed) {
    setMessage("uploadMessage", `${sent} foto${sent === 1 ? " enviada" : "s enviadas"} com sucesso.`, "success");
  } else {
    setMessage("uploadMessage", `${sent} enviada${sent === 1 ? "" : "s"}; ${failed} com erro. Toque em Enviar lote para tentar novamente.`, "error");
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
  byId("accessForm").addEventListener("submit", handleAccess);
  bindFileInput("cameraInput");
  bindFileInput("galleryInput");
  byId("clearButton").addEventListener("click", clearPhotos);
  byId("sendButton").addEventListener("click", sendBatch);
  byId("periodFrom").addEventListener("change", () => {
    if (!byId("periodTo").value || byId("periodTo").value < byId("periodFrom").value) byId("periodTo").value = byId("periodFrom").value;
  });
  refreshIcons();

  if (state.accessCode) {
    setMessage("accessMessage", "Validando acesso salvo...");
    try {
      await verifyAccess(state.accessCode);
      showUploadPanel();
    } catch (error) {
      sessionStorage.removeItem("sueds-opinions-upload-token");
      state.accessCode = "";
      setMessage("accessMessage", "Digite o codigo de acesso.");
    }
  }
}

init();
