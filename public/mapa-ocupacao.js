(function () {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const form = byId("filterForm"), start = byId("startDate"), end = byId("endDate"), hotel = byId("hotelFilter"), lowAvailabilityOnly = byId("lowAvailabilityOnly");
  const content = byId("dashboardContent"), map = byId("occupancyMap"), loading = byId("loadingState"), error = byId("errorNotice");
  const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
  const date = (value) => new Date(`${value}T12:00:00Z`);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function render(hotels) {
    if (lowAvailabilityOnly.checked) hotels = hotels.map((item) => ({ ...item, days: (item.days || []).filter((day) => day.available <= 3) })).filter((item) => item.days.length);
    if (!hotels.length) { map.innerHTML = '<div class="empty">Sem estadias capturadas para este período.</div>'; return; }
    map.innerHTML = hotels.map((item) => {
      const days = item.days || [];
      const cells = (get, css = "") => days.map((day) => `<td class="${typeof css === "function" ? css(day) : css}">${safe(get(day))}</td>`).join("");
      return `<article class="occupancy-hotel"><h2>${safe(item.hotel)} · ${integer.format(item.apartments)} apartamentos</h2><div class="occupancy-scroll"><table class="occupancy-table"><thead><tr><th class="occupancy-row-label">Mês</th>${days.map((day) => `<th class="occupancy-month">${safe(month.format(date(day.date)).replace(".", "").slice(0, 3))}</th>`).join("")}</tr><tr><th class="occupancy-row-label">Dia</th>${days.map((day) => `<th class="occupancy-day"><b>${safe(day.date.slice(8))}</b><small>${safe(weekday.format(date(day.date)).replace(".", ""))}</small></th>`).join("")}</tr></thead><tbody><tr><th class="occupancy-row-label">UHs</th>${cells(() => integer.format(item.apartments))}</tr><tr><th class="occupancy-row-label">Manutenção</th>${cells((day) => integer.format(day.maintenance || 0))}</tr><tr><th class="occupancy-row-label">Ocupados</th>${cells((day) => integer.format(day.occupied))}</tr><tr><th class="occupancy-row-label">Disponíveis</th>${cells((day) => integer.format(day.available), (day) => day.available < 0 ? "occupancy-over" : day.available <= 3 ? "occupancy-low" : "")}</tr><tr><th class="occupancy-row-label">Ocupação</th>${cells((day) => `${integer.format(day.rate)}%`, "occupancy-rate")}</tr></tbody></table></div></article>`;
    }).join("");
  }

  async function load() {
    error.hidden = true; loading.hidden = false; content.hidden = true;
    try {
      const response = await fetch(`/api/dashboard/mapa-ocupacao?${new URLSearchParams(new FormData(form))}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) { window.top.location.href = "/login"; return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o mapa.");
      hotel.innerHTML = '<option value="">Todos os hotéis</option>' + (payload.filters?.hotels || []).map((value) => `<option value="${safe(value)}">${safe(value)}</option>`).join("");
      hotel.value = payload.selected?.hotel || "";
      if (!start.value) start.value = payload.period?.start || "";
      if (!end.value) end.value = payload.period?.end || "";
      const updatedAt = payload.updatedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(payload.updatedAt)) : "não informada";
      byId("dataStamp").textContent = `Última atualização do KPI: ${updatedAt}`;
      render(payload.occupancy || []); content.hidden = false;
    } catch (caught) { error.textContent = caught.message || "Não foi possível carregar o mapa."; error.hidden = false; }
    finally { loading.hidden = true; }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  byId("clearFilters").addEventListener("click", () => { start.value = ""; end.value = ""; hotel.value = ""; lowAvailabilityOnly.checked = false; load(); });
  load();
})();
