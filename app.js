const data = window.SUEDS_DASHBOARD_DATA;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("pt-BR");

function byId(id) {
  return document.getElementById(id);
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function renderSummary() {
  byId("salesToday").textContent = money.format(data.sales.today);
  byId("dailyGoal").textContent = `${percentage(data.sales.today, data.goals.daily)}% da meta diária`;
  byId("reservationsToday").textContent = number.format(data.sales.reservationsToday);
  byId("ticketAverage").textContent = `Ticket médio ${money.format(data.sales.ticketAverage)}`;
  byId("salesMonth").textContent = money.format(data.sales.month);
  byId("monthlyGoal").textContent = `${percentage(data.sales.month, data.goals.monthly)}% da meta mensal`;
  byId("onlineUsers").textContent = number.format(data.site.onlineNow);
  byId("monthUsers").textContent = `${number.format(data.site.uniqueUsersMonth)} usuários no mês`;

  const updated = new Date(data.updatedAt);
  byId("lastUpdate").textContent = `Atualizado ${updated.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function renderFunnel() {
  const start = data.funnel[0]?.value || 0;
  const reserved = data.funnel.find((item) => item.label === "Reservou")?.value || 0;
  byId("funnelConversion").textContent = `${percentage(reserved, start)}%`;

  byId("funnelList").innerHTML = data.funnel
    .map((item) => {
      const width = Math.max(4, percentage(item.value, start));
      return `
        <div class="funnel-step">
          <div>
            <div class="row-label">${item.label}</div>
            <div class="track"><div class="fill" style="width: ${width}%"></div></div>
          </div>
          <strong>${number.format(item.value)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderChannels() {
  const max = Math.max(...data.channels.map((item) => item.value));
  byId("channelBars").innerHTML = data.channels
    .map((item) => `
      <div class="bar-row">
        <span class="row-label">${item.label}</span>
        <div class="track"><div class="fill" style="width: ${percentage(item.value, max)}%"></div></div>
        <strong class="bar-value">${money.format(item.value)}</strong>
      </div>
    `)
    .join("");
}

function renderRanking() {
  byId("agentRanking").innerHTML = data.agents
    .map((agent, index) => `
      <div class="ranking-row">
        <span class="rank-position">${index + 1}</span>
        <span class="row-label">${agent.name}</span>
        <strong>${money.format(agent.value)}</strong>
      </div>
    `)
    .join("");
}

function renderHotels() {
  byId("hotelTable").innerHTML = data.hotels
    .map((hotel) => `
      <div class="hotel-row">
        <span class="row-label">${hotel.name}</span>
        <span class="row-meta">${hotel.occupancy}</span>
        <strong>${money.format(hotel.sales)}</strong>
      </div>
    `)
    .join("");
}

function renderAlerts() {
  byId("alerts").innerHTML = data.alerts
    .map((alert) => `<span class="alert-item">${alert}</span>`)
    .join("");
}

function renderDashboard() {
  renderSummary();
  renderFunnel();
  renderChannels();
  renderRanking();
  renderHotels();
  renderAlerts();
}

renderDashboard();
