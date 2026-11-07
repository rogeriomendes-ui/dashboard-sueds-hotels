(() => {
  const body = document.getElementById("incidentsBody");
  const table = body?.closest("table");
  if (!table) return;

  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;justify-content:flex-end;padding:8px 14px";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "PDF / Imprimir";
  button.title = "Imprimir a listagem atual ou salvar como PDF";
  button.style.cssText = "padding:8px 14px;border:1px solid #1c617b;border-radius:4px;background:#fff;color:#1c617b;font:inherit;font-weight:700;cursor:pointer";
  toolbar.append(button);
  table.parentElement.before(toolbar);

  button.addEventListener("click", () => {
    const preview = window.open("", "_blank", "width=1100,height=800");
    if (!preview) {
      window.alert("Permita abrir a janela de impressão neste navegador e tente novamente.");
      return;
    }
    preview.opener = null;
    const doc = preview.document;
    doc.title = "Opiniários - " + (document.getElementById("hotelPageName")?.textContent || "SUEDS Hotels");
    doc.documentElement.lang = "pt-BR";
    const style = doc.createElement("style");
    style.textContent = `
      @page { size: A4 landscape; margin: 10mm; }
      body { margin: 20px; font: 10px Arial, sans-serif; color: #15242e; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #aab8bf; padding: 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #e4edf1; }
      th:nth-child(5) { width: 30%; }
      th:nth-child(4), th:nth-child(6) { width: 11%; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      button { margin-bottom: 16px; padding: 8px 14px; cursor: pointer; }
      @media print { body { margin: 0; } button { display: none; } }
    `;
    doc.head.append(style);
    const printButton = doc.createElement("button");
    printButton.textContent = "Imprimir / Salvar como PDF";
    printButton.addEventListener("click", () => preview.print());
    const heading = doc.createElement("h1");
    heading.textContent = doc.title;
    const context = doc.createElement("p");
    const period = document.getElementById("daySelect");
    const month = document.getElementById("monthSelect");
    const filter = document.querySelector("[data-filter].active")?.textContent;
    const search = document.getElementById("queueSearch")?.value.trim();
    context.textContent = [
      period && !period.hidden ? period.value : month?.selectedOptions[0]?.textContent,
      document.querySelector("[data-period-mode].active")?.textContent,
      filter,
      search ? `Busca: ${search}` : "",
      document.getElementById("queueCount")?.textContent,
      `Emitido em ${new Date().toLocaleString("pt-BR")}`
    ].filter(Boolean).join(" • ");
    const snapshot = table.cloneNode(true);
    snapshot.removeAttribute("id");
    snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    snapshot.querySelectorAll(".cell-label, svg, i").forEach((node) => node.remove());
    snapshot.querySelectorAll("th, td").forEach((cell) => {
      cell.querySelectorAll("br").forEach((br) => br.replaceWith(" / "));
      cell.textContent = cell.textContent.replace(/\s+/g, " ").trim();
      cell.removeAttribute("style");
    });
    doc.body.replaceChildren(printButton, heading, context, snapshot);
    preview.focus();
    preview.requestAnimationFrame(() => preview.requestAnimationFrame(() => preview.print()));
  });
})();
