(function () {
  "use strict";
  const form = document.getElementById("executivePdfForm");
  const month = document.getElementById("executiveMonth");
  const button = document.getElementById("exportExecutivePdf");
  const pptButton = document.getElementById("exportExecutivePptx");
  const status = document.getElementById("executivePdfStatus");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === "year").value);
  const currentMonth = Number(parts.find(part => part.type === "month").value);
  const previous = new Date(Date.UTC(year, currentMonth - 2, 1)).toISOString().slice(0, 7);
  month.max = previous < "2026-12" ? previous : "2026-12";
  month.value = month.max;
  button.disabled = month.max < month.min;
  pptButton.disabled = button.disabled;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const format = event.submitter?.value === "pptx" ? "pptx" : "pdf";
    const selectedMonth = month.value;
    button.disabled = true;
    pptButton.disabled = true;
    month.disabled = true;
    status.textContent = "Gerando relatório…";
    try {
      const params = new URLSearchParams({ format, month: selectedMonth, hotel: document.getElementById("hotelFilter").value });
      const response = await fetch(`/api/dashboard/bi-relatorios-kpi?${params}`, { credentials: "same-origin", headers: { Accept: format === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf" } });
      if (response.status === 401) { window.top.location.href = "/portal-login.html"; return; }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error === "internal_error" ? "Não foi possível gerar o relatório. Tente novamente." : error.error || "Não foi possível gerar o relatório.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `executivo-kpi-${selectedMonth}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = format === "pptx" ? "PowerPoint gerado." : "PDF gerado.";
    } catch (error) {
      status.textContent = error.message || "Não foi possível gerar o PDF.";
    } finally {
      button.disabled = false;
      pptButton.disabled = false;
      month.disabled = false;
    }
  });
})();
