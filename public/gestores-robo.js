(function () {
  "use strict";

  if (window.__suedsRobotManagerLoaded) return;
  window.__suedsRobotManagerLoaded = true;

  const cache = new Map();
  let scheduled = false;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }

  function selectedMonth() {
    const selects = Array.from(document.querySelectorAll("select"));
    const preferred = selects.find((select) => {
      const identity = normalize(
        `${select.id} ${select.name} ${select.getAttribute("aria-label") || ""}`,
      );
      return /mes|month/.test(identity) && /^\d{4}-\d{2}$/.test(select.value);
    });
    const fallback = selects.find((select) => /^\d{4}-\d{2}$/.test(select.value));
    const value = (preferred || fallback)?.value;
    if (value) return value;

    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function rankingTable() {
    return Array.from(document.querySelectorAll("table")).find((table) => {
      const header = normalize(
        Array.from(table.querySelectorAll("th"))
          .map((cell) => cell.textContent)
          .join(" "),
      );
      return (
        header.includes("responsavel") &&
        header.includes("reservas") &&
        header.includes("venda") &&
        header.includes("meta") &&
        header.includes("icm")
      );
    });
  }

  async function loadRobot(month) {
    if (!cache.has(month)) {
      cache.set(
        month,
        fetch(`/api/robot-sales?month=${encodeURIComponent(month)}`, {
          cache: "no-store",
        })
          .then((response) => {
            if (!response.ok) throw new Error("Falha ao consultar vendas do robo");
            return response.json();
          })
          .then((payload) => payload.robot || null)
          .catch(() => null),
      );
    }
    return cache.get(month);
  }

  async function renderRobotRow() {
    const table = rankingTable();
    if (!table) return;

    const month = selectedMonth();
    const robot = await loadRobot(month);
    const previous = table.querySelector('tr[data-robot-row="true"]');

    if (!robot || (!robot.sales && !robot.revenue)) {
      previous?.remove();
      return;
    }

    const signature = `${month}|${robot.reservations}|${robot.revenue}`;
    if (previous?.dataset.robotSignature === signature) return;
    previous?.remove();

    const body = table.querySelector("tbody");
    const rows = Array.from(body?.querySelectorAll("tr") || []).filter(
      (row) => row.dataset.robotRow !== "true",
    );
    const template = rows[rows.length - 1];
    if (!body || !template) return;

    const row = template.cloneNode(true);
    row.dataset.robotRow = "true";
    row.dataset.robotSignature = signature;
    row.classList.add("robot-ranking-row");

    const cells = row.querySelectorAll("td");
    if (cells.length < 6) return;

    cells[0].textContent = "-";
    cells[1].textContent = "ROBÔ";
    cells[2].textContent = String(robot.reservations || robot.sales || 0);
    cells[3].textContent = formatCurrency(robot.revenue);
    cells[4].textContent = "Sem meta";
    cells[5].textContent = "Sem meta";
    cells[4].className = "";
    cells[5].className = "";
    body.appendChild(row);
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderRobotRow();
    });
  }

  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement) {
      cache.clear();
      scheduleRender();
    }
  });

  new MutationObserver(scheduleRender).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRender);
  } else {
    scheduleRender();
  }
})();
