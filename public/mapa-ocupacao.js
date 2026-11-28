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
  const displayNumber = (value) => value == null ? "—" : integer.format(value);
  const availabilityFilters = [lowAvailabilityOnly, byId('channelEmptyOnly'), byId('channelOpenOnly')];
  function matchesAvailability(day) {
    if (!availabilityFilters.some(input => input.checked)) return true;
    if (day.available == null) return false;
    const channels = [day.channels?.omnibees?.available, day.channels?.juniper?.available, day.channels?.cvc?.available];
    return lowAvailabilityOnly.checked && day.available <= 5
      || byId('channelEmptyOnly').checked && day.available > 3 && channels.some(value => value === 0)
      || byId('channelOpenOnly').checked && day.available < 5 && channels.some(value => Number.isFinite(value) && value > 0);
  }

  function render(hotels) {
    hotels = hotels.map((item) => ({ ...item, days: (item.days || []).filter(matchesAvailability) })).filter((item) => item.days.length);
    if (!hotels.length || !hotels.some((item) => item.days?.some((day) => day.available != null || day.channels?.omnibees || day.channels?.juniper || day.channels?.cvc))) { map.textContent = availabilityFilters.some(input => input.checked) ? 'Nenhuma data atende aos filtros selecionados.' : 'Sem dados de ocupação do KPI para este período.'; return; }
    map.innerHTML = hotels.map((item) => {
      const days = item.days || [];
      const cells = (get, css = "") => days.map((day) => `<td class="${typeof css === "function" ? css(day) : css}">${safe(get(day))}</td>`).join("");
      const categories = [...new Set(days.flatMap((day) => (day.roomTypes || []).map((type) => type.code)))];
      const names = new Map([["STD", "Standard"], ["LX", "Luxo"], ["MAS", "Suíte"]]);
      const detailRows = (label, metric) => categories.map((code) =>
        `<tr class="occupancy-detail" data-metric="${metric}"><th scope="row" class="occupancy-row-label" title="${safe(names.get(code) || code)}">${label} · ${safe(code)}</th>${
          cells((day) => displayNumber(day.roomTypes?.find((type) => type.code === code)?.[metric]))
        }</tr>`
      ).join("");
      return `<article class="occupancy-hotel"><h2>${safe(item.hotel)} · ${integer.format(item.apartments)} apartamentos</h2><div class="occupancy-scroll"><table class="occupancy-table"><thead><tr><th class="occupancy-row-label">Mês</th>${days.map((day) => `<th class="occupancy-month">${safe(month.format(date(day.date)).replace(".", "").slice(0, 3))}</th>`).join("")}</tr><tr><th class="occupancy-row-label">Dia</th>${days.map((day) => `<th class="occupancy-day"><b>${safe(day.date.slice(8))}</b><small>${safe(weekday.format(date(day.date)).replace(".", ""))}</small></th>`).join("")}</tr></thead><tbody>${detailRows("UHs", "apartments")}${detailRows("Ocup.", "occupied")}${detailRows("Disp.", "available")}<tr><th class="occupancy-row-label">UHs</th>${cells((day) => displayNumber(day.apartments))}</tr><tr><th class="occupancy-row-label">Manutenção</th>${cells((day) => displayNumber(day.maintenance))}</tr><tr><th class="occupancy-row-label">Ocupados</th>${cells((day) => displayNumber(day.occupied))}</tr><tr><th class="occupancy-row-label">Disponíveis</th>${cells((day) => displayNumber(day.available), (day) => day.available == null ? "" : day.available < 0 ? "occupancy-over" : day.available <= 3 ? "occupancy-low" : "")}</tr><tr><th class="occupancy-row-label">Ocupação</th>${cells((day) => day.rate == null ? "—" : `${integer.format(day.rate)}%`, "occupancy-rate")}</tr></tbody></table></div></article>`;
    }).join("");
    map.querySelectorAll('.occupancy-hotel').forEach((article, index) => {
      const days = hotels[index].days;
      const excluded = name => /^(?:concorrencia|reacomodacao)\b/i.test(String(name).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const rateNames = [...new Set(days.flatMap(day => (day.channels?.cvc?.rates || []).map(rate => rate.name)))].filter(name => !excluded(name));
      const tariffRows = [];
      for (const [source, label] of [['omnibees', 'Omnibees'], ['juniper', 'Azul / Juniper'], ['cvc', 'Inventário · CVC']]) {
        const tr = document.createElement('tr'); tr.className = source === 'omnibees' ? 'channel-row channel-first' : 'channel-row';
        const th = document.createElement('th'); th.className = 'occupancy-row-label'; th.textContent = label; tr.append(th);
        for (const day of hotels[index].days || []) {
          const td = document.createElement('td'), reading = day.channels?.[source];
          td.textContent = displayNumber(reading?.available);
          if (Number.isSafeInteger(reading?.available)) {
            td.title = `${label} · ${day.date} · Disponíveis: ${reading.available}` + (reading.stopSales ? ` · SS em ${reading.stopSales} categoria(s); cupo original: ${reading.rawAvailable}.` : '');
            if (reading.stopSales && reading.available === 0) { const ss = document.createElement('small'); ss.textContent = ' SS'; td.append(ss); }
            if (day.available != null && day.available <= 0 && reading.available > 0) td.className = 'channel-risk';
            else if (day.available > 3 && reading.available === 0) td.className = 'channel-empty';
          } else td.title = 'Sem captura do canal para este hotel/data.';
          tr.append(td);
        }
        if (source === 'cvc' && rateNames.length) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          const setExpanded = expanded => {
            toggle.textContent = expanded ? '−' : '+';
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.setAttribute('aria-label', (expanded ? 'Retrair' : 'Expandir') + ' tarifários CVC de ' + hotels[index].hotel);
            tariffRows.forEach(row => { row.hidden = !expanded; });
          };
          setExpanded(false);
          toggle.addEventListener('click', () => setExpanded(toggle.getAttribute('aria-expanded') === 'false'));
          th.prepend(toggle, ' ');
        }
        article.querySelector('tbody').append(tr);
      }
      for (const name of rateNames) {
        const row = document.createElement('tr');
        row.className = 'channel-row';
        const label = document.createElement('th');
        label.className = 'occupancy-row-label';
        label.scope = 'row';
        row.hidden = true;
        tariffRows.push(row);
        label.textContent = name;
        label.title = 'Tarifário CVC · ' + name;
        row.append(label);
        for (const day of days) {
          const rate = day.channels?.cvc?.rates?.find(item => item.name === name);
          const cell = document.createElement('td');
          cell.textContent = displayNumber(rate?.available);
          cell.title = name + ' · ' + day.date + ' · Allotment cadastrado na CVC';
          if (rate) {
            const low = rate.minimumStay;
            const high = rate.minimumStayHigh;
            cell.title += ' · Mín. diárias: ' + displayNumber(low);
            if (low != null && high > low) cell.title += '–' + displayNumber(high);
          }
          row.append(cell);
        }
        article.querySelector('tbody').append(row);
      }
      for (const [source, label] of [['omnibees', 'Omnibees'], ['juniper', 'Azul / Juniper'], ['cvc', 'CVC']]) {
        const row = document.createElement('tr');
        row.className = 'channel-row';
        const heading = document.createElement('th');
        heading.className = 'occupancy-row-label';
        heading.scope = 'row';
        heading.textContent = 'Mín. diárias · ' + label;
        row.append(heading);
        for (const day of hotels[index].days) {
          const cell = document.createElement('td');
          let reading = day.channels?.[source];
          if (source === 'cvc' && reading?.rates?.some(rate => excluded(rate.name))) {
            const kept = reading.rates.filter(rate => !excluded(rate.name));
            const complete = kept.length && kept.every(rate => rate.minimumStay != null);
            reading = {
              minimumStay: complete ? Math.min(...kept.map(r => r.minimumStay)) : null,
              minimumStayHigh: complete ? Math.max(...kept.map(r => r.minimumStayHigh ?? r.minimumStay)) : null
            };
          }
          cell.textContent = displayNumber(reading?.minimumStay);
          if (reading?.minimumStayHigh > reading?.minimumStay) {
            cell.textContent += '–' + displayNumber(reading.minimumStayHigh);
          }
          row.append(cell);
        }
        article.querySelector('tbody').append(row);
      }
    });
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
      byId("dataStamp").textContent = `Última atualização da ocupação no KPI: ${updatedAt}. “—” indica dado sem captura.`;
      const stamps = (payload.channelCaptures || []).map(c => `${({ omnibees: 'Omnibees', juniper: 'Azul / Juniper', cvc: 'CVC' })[c.source]}: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(c.capturedAt))}`);
      byId('channelStamp').textContent = (payload.channelError || (stamps.length ? 'Capturas dos canais · ' + stamps.join(' · ') + ' · Brasília.' : 'Canais aguardando publicação das capturas.')) + ' “—” = sem captura; zero = disponibilidade zerada. SS fecha a venda da categoria. Omnibees: referência nos tarifários WEB do Calendário 360.';
      render(payload.occupancy || []); content.hidden = false;
    } catch (caught) { error.textContent = caught.message || "Não foi possível carregar o mapa."; error.hidden = false; }
    finally { loading.hidden = true; }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  byId("clearFilters").addEventListener("click", () => { start.value = ""; end.value = ""; hotel.value = ""; availabilityFilters.forEach(input => { input.checked = false; }); load(); });
  load();
})();
