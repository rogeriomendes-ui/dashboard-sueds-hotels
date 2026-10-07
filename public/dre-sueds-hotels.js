(function setupDre() {
  const byId = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const compactMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const plainNumber = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hotelSelect = byId("hotelSelect");
  const yearSelect = byId("yearSelect");
  const downloadXls = byId("downloadXls");
  let currentRequest = 0;
  let activeSheet = "dre";
  let currentDataPartial = false;
  let sourceData = null;
  const sheetCache = new Map();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function summaryLine(data, id) {
    const line = data.summary.find((item) => item.id === id);
    if (!line || !Array.isArray(line.monthly) || line.monthly.length !== data.months.length || !Number.isFinite(line.total)) {
      throw new Error(`Linha obrigatória ausente: ${id}`);
    }
    return line;
  }

  function showEmpty(title, description) {
    byId("report").hidden = true;
    byId("emptyState").hidden = false;
    byId("emptyState").querySelector("h2").textContent = title;
    byId("emptyDescription").textContent = description;
  }

  function setActiveSheet(sheetId) {
    activeSheet = sheetId;
    document.querySelectorAll(".report-tab").forEach((button) => {
      const selected = button.dataset.sheet === sheetId;
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    byId("dreOverview").hidden = sheetId !== "dre" || currentDataPartial;
    byId("partialOverview").hidden = sheetId !== "dre" || !currentDataPartial;
    byId("sourceView").hidden = sheetId === "dre";
  }

  function sourceValue(value, format) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string" && value.startsWith("#")) return "Erro na origem";
    if (typeof value !== "number") return String(value);
    if (format === "percent") return percent.format(value);
    if (format === "count") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
    return plainNumber.format(value);
  }

  function setSourceOptions(sheet) {
    const month = byId("sourceMonth");
    month.replaceChildren();
    const all = element("option", "", sheet.type === "budget" ? (sheet.sourceMode === "kpi" ? "Ano completo" : "Total do ano · origem") : "Ano completo");
    all.value = sheet.type === "budget" ? "12" : "all";
    month.append(all);
    sheet.months.forEach((name, index) => {
      const option = element("option", "", name);
      option.value = String(index);
      month.append(option);
    });
    const group = byId("sourceGroup");
    group.replaceChildren();
    const allGroups = element("option", "", "Todos os grupos");
    allGroups.value = "";
    group.append(allGroups);
    for (const name of [...new Set(sheet.rows.map((row) => row.group))]) {
      const option = element("option", "", name);
      option.value = name;
      group.append(option);
    }
    byId("sourceSearch").value = "";
  }

  function renderSourceTable() {
    const sheet = sourceData;
    if (!sheet) return;
    const selectedMonth = byId("sourceMonth").value;
    const selectedGroup = byId("sourceGroup").value;
    const query = byId("sourceSearch").value.trim().toLocaleLowerCase("pt-BR");
    const table = byId("sourceTable");
    const head = table.tHead;
    const body = table.tBodies[0];
    head.replaceChildren();
    body.replaceChildren();
    const columns = sheet.type === "budget"
      ? ["Conta", "Orçado", "Realizado", "Diferença"]
      : ["Conta", ...(selectedMonth === "all" ? sheet.months : [sheet.months[Number(selectedMonth)]]), "Total", "Média"];
    const header = element("tr");
    for (const title of columns) {
      const th = element("th", "", title);
      th.scope = "col";
      header.append(th);
    }
    head.append(header);
    let visible = 0;
    let errors = 0;
    const fragment = document.createDocumentFragment();
    for (const row of sheet.rows) {
      if (selectedGroup && row.group !== selectedGroup) continue;
      if (query && !row.label.toLocaleLowerCase("pt-BR").includes(query)) continue;
      let values;
      if (sheet.type === "budget") {
        values = row.values[Number(selectedMonth)];
        if (sheet.sourceMode === "original" && selectedMonth === "12" && [4, 7, 8, 9].includes(row.sourceRow)) values = [null, null, null];
      } else {
        values = selectedMonth === "all" ? row.values : [row.values[Number(selectedMonth)], row.values[12], row.values[13]];
      }
      const tr = element("tr", `source-${row.kind}`);
      const label = element("th", "", row.label);
      label.scope = "row";
      tr.append(label);
      for (const value of values) {
        const td = element("td", typeof value === "string" && value.startsWith("#") ? "source-error" : "", sourceValue(value, row.format));
        if (td.className === "source-error") { td.title = `Erro ${value} na célula da planilha original`; errors++; }
        tr.append(td);
      }
      fragment.append(tr);
      visible++;
    }
    body.append(fragment);
    byId("sourceCount").textContent = `${visible} linhas`;
    const warning = byId("sourceWarning");
    const notes = [];
    if (sheet.notice) notes.push(sheet.notice);
    if (sheet.sourceMode === "original" && sheet.type === "budget" && selectedMonth === "12") notes.push("Indicadores percentuais e tarifas anuais foram omitidos porque os totais da origem somam valores mensais e não representam uma média anual.");
    if (errors) notes.push(`${errors} célula${errors === 1 ? " contém" : "s contêm"} erro de fórmula na planilha original.`);
    warning.textContent = notes.join(" ");
    warning.hidden = notes.length === 0;
  }

  function payrollSheet(items, year) {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const rows = new Map();
    const parse = value => Number(String(value).replace(/\./g, '').replace(',', '.'));
    const add = (item, label, value, format = 'currency') => {
      const key = `${item.companyCode}:${label}`;
      if (!rows.has(key)) rows.set(key, { group: item.companyName, label, kind: 'detail', format, values: Array(14).fill(null) });
      const row = rows.get(key);
      row.values[Number(item.month.slice(5)) - 1] = value;
    };
    for (const item of items) {
      for (const [key, label] of [['liquido', 'Líquido'], ['encargos', 'Encargos'], ['proventos', 'Proventos'], ['descontos', 'Descontos']]) add(item, label, item.totals[key]);
      add(item, 'Admissões · valor', item.admissions.total);
      add(item, 'Demissões · valor', item.dismissals.total);
      add(item, 'Admissões · quantidade', item.admissions.count, 'count');
      add(item, 'Demissões · quantidade', item.dismissals.count, 'count');
      for (const [field, prefix, amountIndex] of [['charges', 'Encargo', 1], ['earnings', 'Provento', 2], ['deductions', 'Desconto', 2]]) {
        for (const event of item[field] || []) add(item, `${prefix} · ${event[amountIndex === 1 ? 0 : 1]}`, parse(event[amountIndex]));
      }
    }
    for (const row of rows.values()) {
      const available = row.values.slice(0, 12).filter(Number.isFinite);
      row.values[12] = available.length ? available.reduce((sum, value) => sum + value, 0) : null;
      row.values[13] = available.length ? row.values[12] / available.length : null;
    }
    return { id: 'folha', title: `Folha de pagamento · ${year}`, description: 'Totais e eventos capturados na Consulta folha do KPI Full. Meses ainda não coletados ficam em branco.', type: 'payroll', sourceMode: 'kpi', months, rows: [...rows.values()] };
  }

  async function showSheet(sheetId) {
    setActiveSheet(sheetId);
    if (sheetId === "dre") return;
    const request = currentRequest;
    sourceData = null;
    byId("sourceTitle").textContent = "Carregando aba…";
    byId("sourceDescription").textContent = "";
    byId("sourceTable").tHead.replaceChildren();
    byId("sourceTable").tBodies[0].replaceChildren();
    try {
      const cacheKey = `${hotelSelect.value}-${yearSelect.value}-${sheetId}`;
      let sheet = sheetCache.get(cacheKey);
      if (!sheet) {
        const response = await fetch(sheetId === 'folha'
          ? `/api/dre/folha-import?year=${encodeURIComponent(yearSelect.value)}&details=1`
          : `/api/dre?hotel=${encodeURIComponent(hotelSelect.value)}&year=${encodeURIComponent(yearSelect.value)}&sheet=${encodeURIComponent(sheetId)}`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível abrir esta aba.");
        const payload = await response.json();
        sheet = sheetId === 'folha' ? payrollSheet(payload.items || [], yearSelect.value) : payload;
        if (sheet.id !== sheetId || !Array.isArray(sheet.rows)) throw new Error("Aba inválida.");
        sheetCache.set(cacheKey, sheet);
      }
      if (request !== currentRequest || activeSheet !== sheetId) return;
      sourceData = sheet;
      byId("sourceTitle").textContent = sheet.title;
      byId("sourceDescription").textContent = `${sheet.description} Valores monetários em R$.`;
      byId("sourceEyebrow").textContent = sheetId === 'folha' ? 'KPI Full · Consulta folha' : 'Modelo do DRE';
      byId("sourceProvenance").textContent = sheetId === 'folha' ? 'Fonte: captura mensal da Folha no KPI Full. Empresas disponíveis no filtro Grupo.' : 'Somente estrutura e nomes de contas. Valores anteriores foram retirados; as outras seções do KPI serão integradas posteriormente.';
      setSourceOptions(sheet);
      renderSourceTable();
    } catch (error) {
      if (request !== currentRequest || activeSheet !== sheetId) return;
      byId("sourceTitle").textContent = "Não foi possível abrir esta aba";
      byId("sourceDescription").textContent = error.message || "Tente novamente mais tarde.";
    }
  }

  function renderStatement(data) {
    const container = byId("statementRows");
    container.replaceChildren();
    for (const line of data.summary) {
      const row = element("div", `statement-row ${line.id.includes("resultado") ? "emphasis" : ""}`);
      row.append(element("span", "", line.label), element("strong", line.total < 0 ? "negative" : "", money.format(line.total)));
      container.append(row);
    }
  }

  function renderBreakdown(containerId, lines, total, colorClass) {
    const container = byId(containerId);
    container.replaceChildren();
    const sorted = [...lines].sort((a, b) => b.total - a.total);
    for (const item of sorted) {
      const share = total > 0 ? item.total / total : 0;
      const row = element("div", "breakdown-item");
      const heading = element("div", "breakdown-heading");
      heading.append(element("span", "", item.label), element("strong", "", compactMoney.format(item.total)));
      const track = element("div", "breakdown-track");
      const fill = element("div", `breakdown-fill ${colorClass}`);
      fill.style.width = `${Math.min(100, Math.max(0, share * 100))}%`;
      fill.title = `${money.format(item.total)} · ${percent.format(share)}`;
      track.append(fill);
      row.append(heading, track, element("small", "", `${percent.format(share)} do total`));
      container.append(row);
    }
  }

  function renderChart(data, revenue, expense, result) {
    const chart = byId("monthChart");
    chart.replaceChildren();
    const max = Math.max(...revenue.monthly, ...expense.monthly);
    chart.style.gridTemplateColumns = `repeat(${data.months.length}, minmax(43px, 1fr))`;
    chart.style.minWidth = `${Math.max(560, data.months.length * 52)}px`;
    data.months.forEach((month, index) => {
      const group = element("div", "month-group");
      const bars = element("div", "month-bars");
      for (const [type, value] of [["revenue", revenue.monthly[index]], ["expense", expense.monthly[index]]]) {
        const bar = element("div", `month-bar ${type}`);
        bar.style.height = `${max > 0 ? Math.max(2, value / max * 100) : 0}%`;
        bar.title = `${month} · ${type === "revenue" ? "Receita" : "Despesa"}: ${money.format(value)}`;
        bars.append(bar);
      }
      group.append(bars, element("span", "month-label", month));
      chart.append(group);
    });
    chart.setAttribute("aria-label", `Receitas e despesas mensais de ${data.hotel} em ${data.year}. Receita anual ${money.format(revenue.total)}; despesa anual ${money.format(expense.total)}.`);
    const best = result.monthly.indexOf(Math.max(...result.monthly));
    const worst = result.monthly.indexOf(Math.min(...result.monthly));
    byId("chartInsight").textContent = `Maior resultado em ${data.months[best]} (${money.format(result.monthly[best])}); menor em ${data.months[worst]} (${money.format(result.monthly[worst])}).`;
  }

  function tableRow(label, revenue, expense, result, className = "") {
    const tr = element("tr", className);
    const month = element("th", "", label);
    month.scope = "row";
    tr.append(month);
    for (const value of [money.format(revenue), money.format(expense), money.format(result), percent.format(revenue ? result / revenue : 0)]) {
      tr.append(element("td", "", value));
    }
    if (result < 0) tr.children[3].classList.add("negative");
    return tr;
  }

  function renderMonthly(data, revenue, expense, result) {
    const body = byId("monthlyRows");
    body.replaceChildren();
    data.months.forEach((month, index) => body.append(tableRow(month, revenue.monthly[index], expense.monthly[index], result.monthly[index])));
    byId("monthlyTotal").replaceChildren(tableRow("Ano", revenue.total, expense.total, result.total, "annual-row"));
  }

  function renderBlankReport(data) {
    currentDataPartial = false;
    for (const id of ['revenueValue', 'revenueExact', 'expenseValue', 'expenseExact', 'resultValue', 'resultExact', 'marginValue', 'occupancyValue', 'adrValue', 'revparValue', 'roomNightsValue']) byId(id).textContent = '—';
    const chart = byId('monthChart');
    chart.replaceChildren(...data.months.map(month => { const group = element('div', 'month-group'); group.append(element('div', 'month-bars'), element('span', 'month-label', month)); return group; }));
    byId('chartInsight').textContent = 'Receitas, despesas e resultado aguardam as próximas capturas do KPI Full.';
    for (const [containerId, lines] of [['statementRows', data.summary], ['revenueBreakdown', data.revenue], ['expenseBreakdown', data.expenses]]) {
      const container = byId(containerId);
      container.replaceChildren();
      for (const line of lines) {
        const row = element('div', containerId === 'statementRows' ? 'statement-row' : 'breakdown-item');
        row.append(element('span', '', line.label), element('strong', '', '—'));
        container.append(row);
      }
    }
    const body = byId('monthlyRows');
    body.replaceChildren();
    const blankRow = label => {
      const row = element('tr');
      const heading = element('th', '', label); heading.scope = 'row'; row.append(heading);
      for (let column = 0; column < 4; column++) row.append(element('td', '', '—'));
      return row;
    };
    data.months.forEach(month => body.append(blankRow(month)));
    byId('monthlyTotal').replaceChildren(blankRow('Ano'));
    byId('statementNote').textContent = 'As fórmulas do DRE serão calculadas após receber as demais bases do KPI Full.';
    byId('sourceNote').textContent = 'Modelo preservado; todos os valores da planilha anterior foram removidos. A Folha capturada está na aba própria.';
    byId('emptyState').hidden = true;
    byId('report').hidden = false;
    setActiveSheet('dre');
    byId('dataStatus').textContent = `${data.hotel} · ${data.year} · aguardando dados`;
    downloadXls.disabled = true;
    downloadXls.title = 'O Excel estará disponível quando o DRE for preenchido com as novas bases';
  }

  function renderReport(data) {
    if (data.schemaVersion !== 1 || !Array.isArray(data.months) || data.months.length < 1 || data.months.length > 12) {
      throw new Error("Formato do DRE não reconhecido.");
    }
    const revenue = summaryLine(data, "receita");
    const expense = summaryLine(data, "despesa");
    const result = summaryLine(data, "resultado_operacional");
    currentDataPartial = false;
    byId("revenueValue").textContent = compactMoney.format(revenue.total);
    byId("revenueExact").textContent = money.format(revenue.total);
    byId("expenseValue").textContent = compactMoney.format(expense.total);
    byId("expenseExact").textContent = money.format(expense.total);
    byId("resultValue").textContent = compactMoney.format(result.total);
    byId("resultExact").textContent = money.format(result.total);
    byId("marginValue").textContent = percent.format(result.total / revenue.total);
    const hospitality = data.hospitality || {};
    const available = hospitality.roomNightsAvailable?.total;
    const paid = hospitality.roomNightsPaid?.total;
    const roomRevenue = hospitality.roomRevenue?.total;
    byId("occupancyValue").textContent = available > 0 && Number.isFinite(paid) ? percent.format(paid / available) : "—";
    byId("adrValue").textContent = paid > 0 && Number.isFinite(roomRevenue) ? money.format(roomRevenue / paid) : "—";
    byId("revparValue").textContent = available > 0 && Number.isFinite(roomRevenue) ? money.format(roomRevenue / available) : "—";
    byId("roomNightsValue").textContent = Number.isFinite(paid) ? integer.format(paid) : "—";
    renderChart(data, revenue, expense, result);
    renderStatement(data);
    renderBreakdown("revenueBreakdown", data.revenue, revenue.total, "revenue-fill");
    renderBreakdown("expenseBreakdown", data.expenses, expense.total, "expense-fill");
    renderMonthly(data, revenue, expense, result);
    const imobilizado = summaryLine(data, "imobilizado").total;
    byId("statementNote").textContent = `O resultado líquido segue a fórmula do modelo: resultado operacional menos imobilizado.${imobilizado === 0 ? " O imobilizado está zerado neste período." : ""}`;
    byId("sourceNote").textContent = `Fonte: ${data.source?.file || "base do DRE"}. Período: ${data.period || data.year}; base ${String(data.basis || "realizado").toLowerCase()}. As despesas são mostradas como valores positivos para facilitar a leitura.`;
    byId("emptyState").hidden = true;
    byId("report").hidden = false;
    setActiveSheet("dre");
    byId("dataStatus").textContent = `${data.hotel} · ${data.year} realizado`;
    downloadXls.disabled = false;
    downloadXls.title = "Baixar o DRE tradicional em Excel";
  }

  function renderPartialReport(data) {
    if (data.schemaVersion !== 1 || data.completeness !== "partial" || !Array.isArray(data.months) || data.months.length !== 12) throw new Error("Formato do período parcial não reconhecido.");
    const revenue = summaryLine(data, "receita");
    const occupied = data.hospitality?.roomNightsOccupied;
    const available = data.hospitality?.roomNightsAvailable;
    if (!occupied || !available || occupied.monthly.length !== 12 || available.monthly.length !== 12) throw new Error("Indicadores de hospedagem incompletos.");
    currentDataPartial = true;
    byId("partialRevenue").textContent = compactMoney.format(revenue.total);
    byId("partialRevenueExact").textContent = money.format(revenue.total);
    byId("partialOccupancy").textContent = percent.format(occupied.total / available.total);
    byId("partialRoomNights").textContent = `${integer.format(occupied.total)} de ${integer.format(available.total)} UHs disponíveis`;
    byId("partialAdr").textContent = money.format(data.hospitality.adr);
    byId("partialRevpar").textContent = money.format(data.hospitality.revpar);
    renderBreakdown("partialRevenueBreakdown", data.revenue, revenue.total, "revenue-fill");
    const chart = byId("partialMonthChart");
    chart.replaceChildren();
    const max = Math.max(...revenue.monthly);
    chart.style.gridTemplateColumns = `repeat(${data.months.length}, minmax(43px, 1fr))`;
    chart.style.minWidth = `${Math.max(560, data.months.length * 52)}px`;
    data.months.forEach((month, index) => {
      const group = element("div", "month-group");
      const bars = element("div", "month-bars");
      const bar = element("div", "month-bar revenue");
      bar.style.height = `${revenue.monthly[index] / max * 100}%`;
      bar.title = `${month}: ${money.format(revenue.monthly[index])}`;
      bars.append(bar);
      group.append(bars, element("span", "month-label", month));
      chart.append(group);
    });
    chart.setAttribute("aria-label", `Receita mensal de ${data.hotel} em ${data.year}; total ${money.format(revenue.total)}.`);
    const best = revenue.monthly.indexOf(max);
    byId("partialChartInsight").textContent = `Maior receita em ${data.months[best]}: ${money.format(max)}.`;
    const statement = byId("partialStatementRows");
    statement.replaceChildren();
    for (const line of data.revenue) {
      const row = element("div", "statement-row");
      row.append(element("span", "", line.label), element("strong", "", money.format(line.total)));
      statement.append(row);
    }
    for (const [label, value] of [["Receita total", money.format(revenue.total)], ["Despesas totais", "Aguardando dados"], ["Resultado operacional", "Aguardando dados"], ["Imobilizado", "Aguardando dados"], ["Resultado líquido", "Aguardando dados"]]) {
      const row = element("div", `statement-row ${label.includes("Resultado") ? "emphasis" : ""}`);
      row.append(element("span", "", label), element("strong", "", value));
      statement.append(row);
    }
    const body = byId("partialMonthlyRows");
    body.replaceChildren();
    const makeRow = (label, amount, occupiedCount, availableCount) => {
      const tr = element("tr");
      const th = element("th", "", label);
      th.scope = "row";
      tr.append(th);
      for (const value of [money.format(amount), integer.format(occupiedCount), percent.format(occupiedCount / availableCount)]) tr.append(element("td", "", value));
      return tr;
    };
    data.months.forEach((month, index) => body.append(makeRow(month, revenue.monthly[index], occupied.monthly[index], available.monthly[index])));
    byId("partialMonthlyTotal").replaceChildren(makeRow("Ano", revenue.total, occupied.total, available.total));
    byId("emptyState").hidden = true;
    byId("report").hidden = false;
    setActiveSheet("dre");
    byId("dataStatus").textContent = `${data.hotel} · ${data.year} · receitas e ocupação`;
    downloadXls.disabled = true;
    downloadXls.title = "DRE em Excel disponível após completar despesas e resultado";
  }

  async function loadReport() {
    const request = ++currentRequest;
    const hotel = hotelSelect.value;
    const year = yearSelect.value;
    const hotelName = hotelSelect.selectedOptions[0]?.textContent || "Hotel";
    byId("periodBadge").textContent = `${year} · ${year === "2026" ? "Ano parcial" : "Ano fechado"}`;
    byId("dataStatus").textContent = "Carregando dados…";
    byId("report").hidden = true;
    byId("emptyState").hidden = true;
    sourceData = null;
    currentDataPartial = false;
    setActiveSheet("dre");
    downloadXls.disabled = true;
    try {
      const response = await fetch(`/api/dre?hotel=${encodeURIComponent(hotel)}&year=${encodeURIComponent(year)}`, { credentials: "same-origin", cache: "no-store" });
      if (request !== currentRequest) return;
      if (response.status === 404) {
        showEmpty("Dados ainda não disponíveis", `${hotelName} em ${year} será incluído após a integração das bases do KPI e a validação do DRE.`);
        byId("dataStatus").textContent = "Aguardando integração";
        return;
      }
      if (!response.ok) throw new Error("Não foi possível carregar o DRE.");
      const data = await response.json();
      if (request !== currentRequest) return;
      if (data.hotelId !== hotel || String(data.year) !== year) throw new Error("Os dados recebidos não correspondem à seleção.");
      if (data.completeness === 'template') renderBlankReport(data);
      else if (data.completeness === "partial") renderPartialReport(data);
      else renderReport(data);
    } catch (error) {
      if (request !== currentRequest) return;
      showEmpty("Não foi possível carregar o DRE", error.message || "Tente novamente mais tarde.");
      byId("dataStatus").textContent = "Falha no carregamento";
    }
  }

  hotelSelect.addEventListener("change", loadReport);
  yearSelect.addEventListener("change", loadReport);
  document.querySelectorAll(".report-tab").forEach((button) => button.addEventListener("click", () => showSheet(button.dataset.sheet)));
  byId("sourceMonth").addEventListener("change", renderSourceTable);
  byId("sourceGroup").addEventListener("change", renderSourceTable);
  byId("sourceSearch").addEventListener("input", renderSourceTable);
  downloadXls.addEventListener("click", () => {
    if (downloadXls.disabled) return;
    const hotel = encodeURIComponent(hotelSelect.value);
    const year = encodeURIComponent(yearSelect.value);
    window.location.href = `/api/dre?hotel=${hotel}&year=${year}&format=xlsx`;
  });
  Promise.resolve(window.suedsManagerAuthReady).then(loadReport).catch(() => {});
})();
