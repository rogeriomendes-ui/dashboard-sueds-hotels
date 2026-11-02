(function () {
  "use strict";
  const form = document.getElementById("executivePdfForm");
  const month = document.getElementById("executiveMonth");
  const button = document.getElementById("exportExecutivePdf");
  const status = document.getElementById("executivePdfStatus");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find(part => part.type === "year").value);
  const currentMonth = Number(parts.find(part => part.type === "month").value);
  const previous = new Date(Date.UTC(year, currentMonth - 2, 1)).toISOString().slice(0, 7);
  month.max = previous < "2026-12" ? previous : "2026-12";
  month.value = month.max;
  button.disabled = month.max < month.min;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    status.textContent = "Gerando relatório…";
    try {
      const params = new URLSearchParams({ format: "pdf", month: month.value, hotel: document.getElementById("hotelFilter").value });
      const response = await fetch(`/api/dashboard/bi-relatorios-kpi?${params}`, { credentials: "same-origin", headers: { Accept: "application/pdf" } });
      if (response.status === 401) { window.top.location.href = "/portal-login.html"; return; }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Não foi possível gerar o PDF.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `executivo-kpi-${month.value}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "PDF gerado.";
    } catch (error) {
      status.textContent = error.message || "Não foi possível gerar o PDF.";
    } finally {
      button.disabled = false;
    }
  });
})();
