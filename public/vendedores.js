const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const commissionMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const number = new Intl.NumberFormat("pt-BR");
const pctNumber = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0
});

const MONTHS = [
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12"
];

const MONTH_LABELS = {
  "2026-05": "MAIO",
  "2026-06": "JUNHO",
  "2026-07": "JULHO",
  "2026-08": "AGOSTO",
  "2026-09": "SETEMBRO",
  "2026-10": "OUTUBRO",
  "2026-11": "NOVEMBRO",
  "2026-12": "DEZEMBRO"
};

const monthSelect = document.getElementById("monthSelect");
const SELLER_TOKEN_STORAGE_KEY = "sueds_seller_access_token";
const MANAGER_TOKEN_STORAGE_KEY = "sueds_gestores_access_token";
let accessToken = "";

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function defaultMonth() {
  const current = currentMonth();
  return MONTHS.includes(current) ? current : "2026-07";
}

function dateForMonth(month) {
  const current = currentMonth();
  const now = new Date();
  if (month === current) {
    return `${month}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function byId(id) {
  return document.getElementById(id);
}

function formatPct(value) {
  if (value === null || value === undefined) return "Sem meta";
  return `${pctNumber.format(value)}%`;
}

function icmClass(value) {
  if (value === null || value === undefined) return "muted";
  return value >= 100 ? "good" : "bad";
}

function formatUpdatedAt(value) {
  if (!value) return "Atualizando...";
  const date = new Date(value);
  return `Atualizado ${date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  })}, ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function setupMonthSelect() {
  monthSelect.innerHTML = MONTHS.map((month) => (
    `<option value="${month}">${MONTH_LABELS[month]}</option>`
  )).join("");

  const params = new URLSearchParams(window.location.search);
  const month = params.get("month");
  monthSelect.value = MONTHS.includes(month) ? month : defaultMonth();
  monthSelect.addEventListener("change", load);
}

function renderSummary(summary = {}) {
  byId("salesToday").textContent = money.format(summary.salesToday || 0);
  byId("salesMonth").textContent = money.format(summary.salesMonth || 0);
  byId("receivedMonth").textContent = money.format(summary.receivedMonth || 0);
  byId("remainingMonth").textContent = money.format(summary.remainingMonth || 0);
  byId("reservationsToday").textContent = `${number.format(summary.reservationsToday || 0)} reservas hoje`;
  byId("monthHint").textContent = `${number.format(summary.reservationsMonth || 0)} reservas no mês`;
  byId("dailyGoal").textContent = `Meta do dia ${money.format(summary.dailyGoal || 0)}`;
  byId("monthlyGoal").textContent = `Meta do mês ${money.format(summary.monthlyGoal || 0)}`;
}

function renderSellers(sellers = []) {
  const ranking = byId("sellerRanking");
  if (!sellers.length) {
    ranking.innerHTML = '<div class="empty-state">Sem dados para este mês.</div>';
    return;
  }

  const rows = sellers.map((seller, index) => {
    const icmValue = seller.monthlyGoalPct;
    const projectionValue = seller.projectionPct;
    const icmText = formatPct(icmValue);
    const projectionText = formatPct(projectionValue);
    const projectionTone = icmClass(projectionValue);
    const icmTone = icmClass(icmValue);
    const commission = seller.commission;
    const commissionCell = (tier, label) => {
      const active = commission?.tier === tier;
      const amount = active ? commissionMoney.format(commission.amount || 0) : "—";
      const rate = active ? `${commission.ratePct.toFixed(2).replace(".", ",")}%` : "";
      return `<span class="metric-cell commission ${active ? "commission-active" : ""}" data-label="${label}" title="${rate ? `Taxa aplicada: ${rate}` : ""}">${amount}</span>`;
    };
    return `
      <div class="ranking-row">
        <span class="rank">${index + 1}</span>
        <span class="seller-name">${seller.name}</span>
        <span class="metric-cell" data-label="Reservas">${number.format(seller.reservationsMonth || 0)}</span>
        <span class="metric-cell" data-label="Venda">${money.format(seller.salesMonth || 0)}</span>
        <span class="metric-cell" data-label="Meta do mês">${money.format(seller.monthlyGoal || 0)}</span>
        <span class="metric-cell" data-label="Meta do dia">${money.format(seller.dailyGoal || 0)}</span>
        <span class="metric-cell projection ${projectionTone}" data-label="Projeção %">${projectionText}</span>
        <span class="metric-cell icm ${icmTone}" data-label="ICM %">${icmText}</span>
        ${commissionCell("below", "Meta não batida")}
        ${commissionCell("goal", "Meta batida")}
        ${commissionCell("super", "Super Meta batida")}
      </div>
    `;
  }).join("");

  ranking.innerHTML = `
    <div class="ranking-row ranking-head">
      <span>#</span>
      <span>Responsável</span>
      <span>Reservas</span>
      <span>Venda</span>
      <span>Meta do mês</span>
      <span>Meta do dia</span>
      <span>Projeção %</span>
      <span>ICM %</span>
      <span>Meta não batida<br>&lt;100%</span>
      <span>Meta batida<br>100%–119,99%</span>
      <span>Super Meta batida<br>≥120%</span>
    </div>
    ${rows}
  `;
}

async function load() {
  const month = monthSelect.value;
  const date = dateForMonth(month);
  const url = `/api/dashboard/vendedores?date=${encodeURIComponent(date)}&month=${encodeURIComponent(month)}`;
  byId("lastUpdate").textContent = "Atualizando...";

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "x-dashboard-token": accessToken }
    });
    if (response.status === 401) {
      localStorage.removeItem(SELLER_TOKEN_STORAGE_KEY);
      document.documentElement.classList.add("seller-auth-pending");
      accessToken = "";
      await ensureAccess();
      return load();
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderSummary(data.summary);
    renderSellers(data.sellers);
    byId("lastUpdate").textContent = formatUpdatedAt(data.generatedAt);
  } catch (error) {
    byId("sellerRanking").innerHTML = '<div class="empty-state error">Falha ao carregar dados dos vendedores.</div>';
    byId("lastUpdate").textContent = "Falha ao atualizar";
  }
}

async function validateAccess(token) {
  const headers = token ? { "x-dashboard-token": token } : {};
  const response = await fetch("/api/dashboard/vendedores?authOnly=1", {
    cache: "no-store",
    credentials: "same-origin",
    headers
  });
  if (!response.ok) return null;
  return response.json();
}

async function loginSeller(username, password, remember) {
  const response = await fetch("/api/dashboard/vendedores?action=login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, remember })
  });
  if (!response.ok) return null;
  return response.json();
}

async function loginManager(password, remember) {
  const response = await fetch("/api/dashboard/vendedores?action=manager-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password, remember })
  });
  if (!response.ok) return null;
  return response.json();
}

function showLogin() {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "seller-login";
    dialog.innerHTML = `
      <form method="dialog" class="seller-login-card">
        <header>
          <span>Central de vendas</span>
          <strong>Acesso ao ranking</strong>
        </header>
        <div class="seller-login-tabs" role="tablist" aria-label="Tipo de acesso">
          <button type="button" class="active" data-auth-mode="seller" role="tab" aria-selected="true">Vendedor</button>
          <button type="button" data-auth-mode="manager" role="tab" aria-selected="false">Gestor</button>
        </div>
        <label data-seller-field>
          <span>Vendedor</span>
          <select name="username">
            <option value="amanda">Amanda Melgaco</option>
            <option value="aline">Aline Nunes</option>
            <option value="emanoel">Emanoel Cesar</option>
            <option value="julia">Julia Reche</option>
            <option value="tatiana">Tatiana Vieira</option>
          </select>
        </label>
          <label>
            <span>Senha</span>
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <label class="seller-login-remember">
            <input name="remember" type="checkbox">
            <span>Manter conectado neste dispositivo por 30 dias</span>
          </label>
          <p class="seller-login-message" role="alert"></p>
        <button type="submit" class="seller-login-submit">Entrar</button>
      </form>
    `;
    document.body.appendChild(dialog);

    const form = dialog.querySelector("form");
    const passwordInput = form.elements.password;
    const message = dialog.querySelector(".seller-login-message");
    const submit = dialog.querySelector(".seller-login-submit");
    const sellerField = dialog.querySelector("[data-seller-field]");
    let mode = "seller";

    function setMode(nextMode) {
      mode = nextMode;
      sellerField.hidden = mode === "manager";
      message.textContent = "";
      dialog.querySelectorAll("[data-auth-mode]").forEach((button) => {
        const active = button.dataset.authMode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      window.setTimeout(() => passwordInput.focus(), 0);
    }

    dialog.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.authMode));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = "Verificando...";

      try {
        const password = String(passwordInput.value || "");
        const remember = Boolean(form.elements.remember.checked);
        if (mode === "manager") {
          const payload = await loginManager(password, remember);
          if (!payload?.token) throw new Error("Senha de gestor inválida.");
          localStorage.setItem(SELLER_TOKEN_STORAGE_KEY, payload.token);
          resolve(payload);
        } else {
          const payload = await loginSeller(form.elements.username.value, password, remember);
          if (!payload?.token) throw new Error("Senha do vendedor inválida.");
          localStorage.setItem(SELLER_TOKEN_STORAGE_KEY, payload.token);
          resolve(payload);
        }
        dialog.close();
        dialog.remove();
      } catch (error) {
        message.textContent = error.message;
        passwordInput.select();
      } finally {
        submit.disabled = false;
      }
    });

    dialog.showModal();
    passwordInput.focus();
  });
}

async function ensureAccess() {
  const portalAccess = await validateAccess("");
  if (portalAccess?.ok && portalAccess.profile?.role === "manager") {
    accessToken = "";
    document.documentElement.classList.remove("seller-auth-pending");
    return portalAccess;
  }

  const managerToken = localStorage.getItem(MANAGER_TOKEN_STORAGE_KEY) || "";
  const managerAccess = await validateAccess(managerToken);
  if (managerAccess?.ok && managerAccess.profile?.role === "manager") {
    accessToken = managerToken;
    document.documentElement.classList.remove("seller-auth-pending");
    return managerAccess;
  }

  const sellerToken = localStorage.getItem(SELLER_TOKEN_STORAGE_KEY) || "";
  const sellerAccess = await validateAccess(sellerToken);
  if (sellerAccess?.ok) {
    accessToken = sellerToken;
    document.documentElement.classList.remove("seller-auth-pending");
    return sellerAccess;
  }

  localStorage.removeItem(SELLER_TOKEN_STORAGE_KEY);
  const login = await showLogin();
  accessToken = login.token;
  document.documentElement.classList.remove("seller-auth-pending");
  return login;
}

async function boot() {
  setupMonthSelect();
  await ensureAccess();
  await load();
  setInterval(load, 60000);
}

boot();
