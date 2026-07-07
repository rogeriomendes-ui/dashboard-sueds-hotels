const SOCIAL_CATEGORIES = [
  "Hoteis",
  "Resorts",
  "Pousadas",
  "Influenciadores",
  "Operadoras",
  "Agencias",
  "Turismo",
  "Praias",
  "Destinos",
  "Restaurantes",
  "Beach Clubs"
];

const THEMES = [
  "Praia",
  "Piscina",
  "Familia",
  "Cafe da manha",
  "Beach Club",
  "Casais",
  "Promocao",
  "Ferias",
  "Inverno",
  "Verao",
  "Luau",
  "Noite tematica",
  "Musica ao vivo"
];

const PROFILE_SEED = [
  ["Sueds Hotels", "@suedshotels", "Hoteis", "Porto Seguro", "BA", "Ativo", 28400, 1.8],
  ["Sueds Trancoso", "@suedstrancoso", "Hoteis", "Trancoso", "BA", "Ativo", 9200, 2.1],
  ["Beach Club Sueds", "@beachclubsued", "Beach Clubs", "Porto Seguro", "BA", "Ativo", 8700, 2.8],
  ["La Torre Resort", "@latorreresort", "Resorts", "Porto Seguro", "BA", "Ativo", 113000, 1.2],
  ["Best Western Shalimar", "@bestwesternshalimar", "Hoteis", "Porto Seguro", "BA", "Ativo", 21400, 0.8],
  ["Brisa da Praia", "@brisadapraiahotel", "Hoteis", "Porto Seguro", "BA", "Ativo", 46500, 1.4],
  ["Portobello", "@portobelloportoseguro", "Resorts", "Porto Seguro", "BA", "Ativo", 38200, 1.1],
  ["Arcobaleno", "@arcobalenohotel", "Hoteis", "Porto Seguro", "BA", "Ativo", 31800, 0.9],
  ["Nauticomar", "@nauticomarhotel", "Hoteis", "Porto Seguro", "BA", "Ativo", 35200, 1.0],
  ["Capoeira Village", "@capoeiravillage", "Pousadas", "Porto Seguro", "BA", "Ativo", 18200, 1.6],
  ["Quinta do Sol", "@hotelquintadosol", "Hoteis", "Porto Seguro", "BA", "Ativo", 28600, 1.2],
  ["Porto Seguro Praia", "@portoseguropraiaresort", "Resorts", "Porto Seguro", "BA", "Ativo", 76200, 1.7],
  ["Melhores Destinos", "@melhoresdestinos", "Turismo", "Sao Paulo", "SP", "Ativo", 2680000, 2.9],
  ["Decolar", "@decolar", "Operadoras", "Sao Paulo", "SP", "Ativo", 1390000, 2.2],
  ["CVC", "@cvcviagens", "Operadoras", "Sao Paulo", "SP", "Ativo", 1180000, 1.9],
  ["Azul Viagens", "@azulviagens", "Operadoras", "Barueri", "SP", "Ativo", 612000, 2.4],
  ["Orinter", "@orintertour", "Operadoras", "Sao Paulo", "SP", "Ativo", 148000, 1.5]
];

const state = {
  data: null,
  filters: {
    city: "",
    state: "",
    category: "",
    period: "30",
    type: "",
    theme: "",
    profile: ""
  },
  chartRange: 15,
  postSort: "engagement",
  compareProfiles: ["Sueds Hotels", "La Torre Resort", "Porto Seguro Praia", "Brisa da Praia", "Melhores Destinos"]
};

const dataProvider = {
  async load() {
    return {
      lastUpdated: new Date().toISOString(),
      profiles: PROFILE_SEED.map((row, index) => ({
        id: `profile-${index + 1}`,
        name: row[0],
        instagram: row[1],
        category: row[2],
        city: row[3],
        state: row[4],
        status: row[5],
        followers: row[6],
        growth: row[7],
        lastUpdated: new Date(Date.now() - index * 3600000).toISOString()
      })),
      posts: generatePosts()
    };
  }
};

function generatePosts() {
  const posts = [];
  const profiles = PROFILE_SEED.map((row) => row[0]);
  const audios = ["Som original", "Praia viral 26", "Forro sunset", "Trend viagem", "Bossa leve", "Luau remix"];
  const ctas = ["Reserve agora", "Veja as tarifas", "Marque quem iria", "Conheca o hotel", "Salve para as ferias"];
  const today = new Date();

  for (let i = 0; i < 150; i += 1) {
    const profile = profiles[i % profiles.length];
    const profileSeed = PROFILE_SEED.find((row) => row[0] === profile);
    const type = i % 5 === 0 ? "Carrossel" : i % 2 === 0 ? "Reel" : "Foto";
    const theme = THEMES[(i * 3 + 2) % THEMES.length];
    const date = new Date(today);
    date.setDate(today.getDate() - (i % 90));
    date.setHours(8 + (i % 14), (i * 7) % 60, 0, 0);
    const views = Math.round((profileSeed[6] / 18) * (0.45 + (i % 9) / 10));
    const likes = Math.round(views * (0.035 + (i % 7) / 100));
    const comments = Math.round(likes * (0.05 + (i % 4) / 100));
    const shares = Math.round(likes * (0.03 + (i % 5) / 100));
    const engagement = views ? ((likes + comments + shares) / views) * 100 : 0;
    posts.push({
      id: `post-${i + 1}`,
      profile,
      date: date.toISOString(),
      type,
      theme,
      likes,
      comments,
      shares,
      views,
      engagement,
      url: `https://instagram.com/p/sueds-demo-${i + 1}`,
      caption: `${theme} em destaque para inspirar viagens para o sul da Bahia.`,
      cta: ctas[i % ctas.length],
      audio: audios[i % audios.length],
      duration: type === "Reel" ? 8 + (i % 24) : 0,
      hashtags: buildHashtags(theme, profileSeed[3])
    });
  }

  return posts;
}

function buildHashtags(theme, city) {
  const slug = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  return ["#suedshotels", `#${slug(theme)}`, `#${slug(city)}`, "#bahia", "#ferias"];
}

function $(id) {
  return document.getElementById(id);
}

function number(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value || 0);
}

function percent(value) {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0)}%`;
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function dateTimeLabel(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getProfile(profileName) {
  return state.data.profiles.find((profile) => profile.name === profileName);
}

function filteredPosts(days = Number(state.filters.period)) {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - days);
  return state.data.posts.filter((post) => {
    const profile = getProfile(post.profile);
    return new Date(post.date) >= minDate
      && (!state.filters.city || profile.city === state.filters.city)
      && (!state.filters.state || profile.state === state.filters.state)
      && (!state.filters.category || profile.category === state.filters.category)
      && (!state.filters.type || post.type === state.filters.type)
      && (!state.filters.theme || post.theme === state.filters.theme)
      && (!state.filters.profile || post.profile === state.filters.profile);
  });
}

function sum(posts, key) {
  return posts.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function average(items, key) {
  return items.length ? items.reduce((total, item) => total + (Number(item[key]) || 0), 0) / items.length : 0;
}

function populateSelect(id, options, firstLabel) {
  const select = $(id);
  const current = select.value;
  select.innerHTML = [`<option value="">${firstLabel}</option>`]
    .concat(options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`))
    .join("");
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renderFilters() {
  const profiles = state.data.profiles;
  populateSelect("cityFilter", unique(profiles.map((profile) => profile.city)), "Todas as cidades");
  populateSelect("stateFilter", unique(profiles.map((profile) => profile.state)), "Todos os estados");
  populateSelect("categoryFilter", SOCIAL_CATEGORIES, "Todas as categorias");
  populateSelect("typeFilter", ["Foto", "Reel", "Carrossel"], "Todos os tipos");
  populateSelect("themeFilter", THEMES, "Todos os temas");
  populateSelect("profileFilter", profiles.map((profile) => profile.name), "Todos os perfis");

  $("periodFilter").innerHTML = [
    ["7", "7 dias"],
    ["15", "15 dias"],
    ["30", "30 dias"],
    ["90", "90 dias"]
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  $("periodFilter").value = state.filters.period;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function renderTopStatus(posts) {
  $("lastUpdate").textContent = dateTimeLabel(state.data.lastUpdated);
  $("profileCount").textContent = number(state.data.profiles.filter((profile) => profile.status === "Ativo").length);
  $("postCount").textContent = number(posts.length);
  $("periodLabel").textContent = `${state.filters.period} dias`;
}

function renderKpis(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const postsToday = posts.filter((post) => post.date.slice(0, 10) === today);
  const reelsToday = postsToday.filter((post) => post.type === "Reel");
  const competitors = state.data.profiles.filter((profile) => !profile.name.startsWith("Sueds") && profile.name !== "Beach Club Sueds");
  const topGrowth = [...state.data.profiles].sort((a, b) => b.growth - a.growth)[0];
  const topViral = [...posts].sort((a, b) => b.views - a.views)[0];
  const kpis = [
    ["Posts publicados hoje", number(postsToday.length), "Conteudos no dia atual"],
    ["Reels publicados hoje", number(reelsToday.length), "Videos curtos publicados"],
    ["Media engaj. concorrentes", percent(average(posts.filter((post) => competitors.some((profile) => profile.name === post.profile)), "engagement")), "Base comparativa"],
    ["Crescimento medio", percent(average(state.data.profiles, "growth")), "Seguidores no periodo"],
    ["Total de curtidas", number(sum(posts, "likes")), "Interacoes positivas"],
    ["Total de comentarios", number(sum(posts, "comments")), "Conversas geradas"],
    ["Total de compartilhamentos", number(sum(posts, "shares")), "Distribuicao espontanea"],
    ["Total de visualizacoes", number(sum(posts, "views")), "Alcance bruto"],
    ["Perfil que mais cresceu", topGrowth?.name || "--", topGrowth ? percent(topGrowth.growth) : "--"],
    ["Post mais viral", topViral?.profile || "--", topViral ? `${number(topViral.views)} views` : "--"]
  ];
  $("kpiGrid").innerHTML = kpis.map(([label, value, note]) => `
    <article class="kpi-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `).join("");
}

function renderChart() {
  const days = state.chartRange;
  const posts = filteredPosts(days);
  const maxPosts = Math.max(1, ...Array.from({ length: days }, (_, index) => {
    const date = dateKey(days - index - 1);
    return posts.filter((post) => post.date.slice(0, 10) === date).length;
  }));

  $("dailyChart").innerHTML = Array.from({ length: days }, (_, index) => {
    const date = dateKey(days - index - 1);
    const dayPosts = posts.filter((post) => post.date.slice(0, 10) === date);
    const reels = dayPosts.filter((post) => post.type === "Reel").length;
    const engagement = average(dayPosts, "engagement");
    return `
      <div class="chart-day" title="${date}">
        <i class="chart-bar engagement" style="height:${Math.max(4, engagement * 10)}px"></i>
        <i class="chart-bar reels" style="height:${Math.max(4, (reels / maxPosts) * 120)}px"></i>
        <i class="chart-bar posts" style="height:${Math.max(4, (dayPosts.length / maxPosts) * 150)}px"></i>
        <span>${dateLabel(`${date}T12:00:00`)}</span>
      </div>
    `;
  }).join("");
}

function dateKey(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

function renderChartRange() {
  $("chartRange").innerHTML = [7, 15, 30, 90].map((days) => `
    <button class="${state.chartRange === days ? "active" : ""}" type="button" data-days="${days}">${days} dias</button>
  `).join("");
}

function sortedPosts(posts) {
  const map = {
    engagement: (post) => post.engagement,
    reach: (post) => post.views,
    comments: (post) => post.comments,
    shares: (post) => post.shares,
    views: (post) => post.views
  };
  const getter = map[state.postSort] || map.engagement;
  return [...posts].sort((a, b) => getter(b) - getter(a));
}

function renderTopPosts(posts) {
  $("postSort").innerHTML = [
    ["engagement", "Maior engajamento"],
    ["reach", "Maior alcance"],
    ["comments", "Mais comentarios"],
    ["shares", "Mais compartilhamentos"],
    ["views", "Mais visualizacoes"]
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  $("postSort").value = state.postSort;
  $("topPostsTable").innerHTML = sortedPosts(posts).slice(0, 40).map((post) => `
    <tr>
      <td><div class="thumb"></div></td>
      <td>${escapeHtml(post.profile)}</td>
      <td>${dateLabel(post.date)}</td>
      <td>${escapeHtml(post.type)}</td>
      <td>${escapeHtml(post.theme)}</td>
      <td>${number(post.likes)}</td>
      <td>${number(post.comments)}</td>
      <td>${number(post.shares)}</td>
      <td>${number(post.views)}</td>
      <td>${percent(post.engagement)}</td>
      <td><a class="link-button" href="${post.url}" target="_blank" rel="noopener">Abrir</a></td>
    </tr>
  `).join("");
}

function renderReels(posts) {
  const reels = sortedPosts(posts.filter((post) => post.type === "Reel")).slice(0, 8);
  $("topReels").innerHTML = reels.map((post) => `
    <article class="reel-card">
      <div class="reel-thumb"></div>
      <div class="reel-meta">
        <strong>${escapeHtml(post.profile)} · ${escapeHtml(post.theme)}</strong>
        <span>${post.duration}s · ${escapeHtml(post.audio)}</span>
        <div class="metric-line">
          <b>${number(post.views)} views</b>
          <b>${percent(post.engagement)} engaj.</b>
        </div>
        <small>${escapeHtml(post.caption)}</small>
        <small>CTA: ${escapeHtml(post.cta)}</small>
      </div>
    </article>
  `).join("") || `<article class="insight-card">Sem reels para este filtro.</article>`;
}

function renderTrends(posts) {
  const groups = groupBy(posts, "theme").sort((a, b) => b.items.length - a.items.length).slice(0, 12);
  $("themeTrends").innerHTML = groups.map((group, index) => {
    const progress = Math.min(100, 35 + group.items.length * 7);
    const growth = (index % 2 === 0 ? 1 : -1) * (8 + index * 3);
    return `
      <article class="trend-card">
        <strong>${escapeHtml(group.key)}</strong>
        <small>${number(group.items.length)} posts · ${percent(average(group.items, "engagement"))} engaj.</small>
        <small>Evolucao: ${growth > 0 ? "+" : ""}${growth}%</small>
        <div class="mini-progress"><i style="width:${progress}%"></i></div>
      </article>
    `;
  }).join("");
}

function renderInsights(posts) {
  const topTheme = groupBy(posts, "theme").sort((a, b) => average(b.items, "engagement") - average(a.items, "engagement"))[0];
  const reels = posts.filter((post) => post.type === "Reel");
  const bestHour = bestPostingHour(posts);
  const insights = [
    `Conteudos sobre ${topTheme?.key || "praia"} lideram engajamento no periodo selecionado.`,
    `Reels entre 10 e 20 segundos concentram ${percent(average(reels.filter((post) => post.duration >= 10 && post.duration <= 20), "engagement"))} de engajamento medio.`,
    "Conteudos com pessoas e experiencias reais tendem a performar melhor que imagens estaticas.",
    `A faixa de ${bestHour}h aparece como melhor horario de publicacao.`,
    "Gastronomia, praia e piscina devem ser testados com variacoes de CTA para venda direta."
  ];
  $("aiInsights").innerHTML = insights.map((text) => `<article class="insight-card">${escapeHtml(text)}</article>`).join("");
}

function renderSuggestions(posts) {
  const topThemes = groupBy(posts, "theme").sort((a, b) => average(b.items, "engagement") - average(a.items, "engagement")).slice(0, 5);
  const suggestions = [
    `Produzir um Reel mostrando ${topThemes[0]?.key.toLowerCase() || "cafe da manha"} com CTA para reserva.`,
    "Publicar video da piscina ao por do sol com cortes rapidos de 10 a 15 segundos.",
    "Criar conteudo sobre o Luau e testar audio em alta usado pelos concorrentes.",
    "Mostrar apartamentos com vista e prova social de hospedes.",
    "Gravar videos curtos com hospedes e equipe para aumentar sensacao de experiencia real."
  ];
  $("contentSuggestions").innerHTML = suggestions.map((text) => `
    <article class="suggestion-card">
      <strong>Sugestao</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `).join("");
}

function renderHashtags(posts) {
  const rows = groupBy(posts.flatMap((post) => post.hashtags.map((tag) => ({ tag, engagement: post.engagement }))), "tag")
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 20);
  $("hashtagsTable").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${escapeHtml(row.key)}</td>
      <td>${number(row.items.length)}</td>
      <td>${index % 2 === 0 ? "+" : ""}${number(6 + index * 2)}%</td>
      <td>${percent(average(row.items, "engagement"))}</td>
    </tr>
  `).join("");
}

function renderAudios(posts) {
  const rows = groupBy(posts.filter((post) => post.type === "Reel"), "audio")
    .sort((a, b) => sum(b.items, "views") - sum(a.items, "views"))
    .slice(0, 16);
  $("audiosTable").innerHTML = rows.map((row, index) => `
    <tr>
      <td>${escapeHtml(row.key)}</td>
      <td>${number(row.items.length)}</td>
      <td>${number(sum(row.items, "views"))}</td>
      <td>${index < 3 ? "Alta" : "Estavel"}</td>
    </tr>
  `).join("");
}

function renderHeatmap(posts) {
  const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
  const hours = [9, 12, 15, 18, 21, 23];
  $("heatmap").innerHTML = [`<div class="heat-label">Dia</div>`]
    .concat(hours.map((hour) => `<div class="heat-label">${hour}h</div>`))
    .concat(weekdays.flatMap((day, dayIndex) => [
      `<div class="heat-label">${day}</div>`,
      ...hours.map((hour) => {
        const matching = posts.filter((post) => {
          const date = new Date(post.date);
          const jsDay = (date.getDay() + 6) % 7;
          return jsDay === dayIndex && Math.abs(date.getHours() - hour) <= 1;
        });
        const value = average(matching, "engagement");
        const opacity = Math.min(1, 0.22 + value / 8);
        return `<div class="heat-cell" style="opacity:${opacity}">${percent(value)}</div>`;
      })
    ])).join("");
}

function renderCompare(posts) {
  $("compareSelector").innerHTML = state.data.profiles.map((profile) => `
    <label>
      <input type="checkbox" value="${escapeHtml(profile.name)}" ${state.compareProfiles.includes(profile.name) ? "checked" : ""}>
      ${escapeHtml(profile.name)}
    </label>
  `).join("");
  $("compareTable").innerHTML = state.compareProfiles.map((profileName) => {
    const profile = getProfile(profileName);
    const profilePosts = posts.filter((post) => post.profile === profileName);
    return `
      <tr>
        <td>${escapeHtml(profileName)}</td>
        <td>${number(profile?.followers)}</td>
        <td>${number(profilePosts.length)}</td>
        <td>${number(profilePosts.filter((post) => post.type === "Reel").length)}</td>
        <td>${number(sum(profilePosts, "likes"))}</td>
        <td>${number(sum(profilePosts, "comments"))}</td>
        <td>${percent(average(profilePosts, "engagement"))}</td>
        <td>${percent(profile?.growth)}</td>
      </tr>
    `;
  }).join("");
}

function renderProfiles() {
  $("profilesTable").innerHTML = state.data.profiles.map((profile) => `
    <tr>
      <td>${escapeHtml(profile.name)}</td>
      <td>${escapeHtml(profile.instagram)}</td>
      <td>${escapeHtml(profile.category)}</td>
      <td>${escapeHtml(profile.city)}</td>
      <td>${escapeHtml(profile.state)}</td>
      <td class="${profile.status === "Ativo" ? "status-active" : "status-paused"}">${escapeHtml(profile.status)}</td>
      <td>${dateTimeLabel(profile.lastUpdated)}</td>
      <td>
        <div class="profile-actions">
          <button class="icon-button" type="button" data-edit="${profile.id}">Editar</button>
          <button class="icon-button" type="button" data-delete="${profile.id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderAgentReport(posts) {
  const topTheme = groupBy(posts, "theme").sort((a, b) => b.items.length - a.items.length)[0]?.key || "praia";
  const opportunities = [
    `Escalar conteudos de ${topTheme} com CTA para reserva direta.`,
    "Testar Reels de 10 a 20 segundos nos horarios de maior engajamento.",
    "Comparar Beach Clubs e resorts em formatos de carrossel.",
    "Usar temas de familia e ferias nos proximos anuncios.",
    "Criar pauta semanal cruzando audio em alta com hotel especifico."
  ];
  const threats = [
    "Concorrentes com maior frequencia de Reels podem capturar atencao no periodo.",
    "Conteudos sem pessoas tendem a perder distribuicao organica.",
    "Promocoes sem CTA claro reduzem potencial de conversao.",
    "Baixa presenca em horarios noturnos limita alcance qualificado.",
    "Pouca comparacao entre unidades pode enfraquecer cross-sell."
  ];
  const ideas = [
    "Cafe da manha em 15 segundos",
    "Piscina ao por do sol",
    "Luau com audio trend",
    "Apartamento com vista",
    "Hospede contando experiencia",
    "Roteiro de fim de semana",
    "Beach Club em familia",
    "Antes e depois do quarto",
    "Top 3 motivos para ir a Trancoso",
    "Oferta relampago com link na bio"
  ];
  $("agentReport").innerHTML = [
    ["5 oportunidades", opportunities],
    ["5 ameacas", threats],
    ["10 ideias de conteudo", ideas]
  ].map(([title, items]) => `
    <article class="agent-card">
      <strong>${escapeHtml(title)}</strong>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `).join("");
}

function groupBy(items, key) {
  const getter = typeof key === "function" ? key : (item) => item[key];
  const groups = new Map();
  items.forEach((item) => {
    const value = getter(item) || "Nao informado";
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
  });
  return [...groups.entries()].map(([groupKey, groupItems]) => ({ key: groupKey, items: groupItems }));
}

function bestPostingHour(posts) {
  const rows = groupBy(posts, (post) => new Date(post.date).getHours())
    .sort((a, b) => average(b.items, "engagement") - average(a.items, "engagement"));
  return rows[0]?.key || 18;
}

function renderAll() {
  const posts = filteredPosts();
  renderFilters();
  renderTopStatus(posts);
  renderKpis(posts);
  renderChartRange();
  renderChart();
  renderInsights(posts);
  renderTopPosts(posts);
  renderReels(posts);
  renderTrends(posts);
  renderSuggestions(posts);
  renderHashtags(posts);
  renderAudios(posts);
  renderHeatmap(posts);
  renderCompare(posts);
  renderProfiles();
  renderAgentReport(posts);
}

function exportExcel() {
  const posts = sortedPosts(filteredPosts());
  const rows = [
    ["Perfil", "Data", "Tipo", "Tema", "Curtidas", "Comentarios", "Compartilhamentos", "Visualizacoes", "Engajamento %", "Link"],
    ...posts.map((post) => [post.profile, dateLabel(post.date), post.type, post.theme, post.likes, post.comments, post.shares, post.views, percent(post.engagement), post.url])
  ];
  const html = `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join("")}</table>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadBlob(blob, `inteligencia-redes-sociais-${new Date().toISOString().slice(0, 10)}.xls`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindEvents() {
  ["city", "state", "category", "period", "type", "theme", "profile"].forEach((key) => {
    $(`${key}Filter`).addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      renderAll();
    });
  });
  $("chartRange").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-days]");
    if (!button) return;
    state.chartRange = Number(button.dataset.days);
    renderAll();
  });
  $("postSort").addEventListener("change", (event) => {
    state.postSort = event.target.value;
    renderAll();
  });
  $("compareSelector").addEventListener("change", (event) => {
    const value = event.target.value;
    if (event.target.checked) {
      if (state.compareProfiles.length >= 5) {
        event.target.checked = false;
        alert("Selecione no maximo 5 perfis.");
        return;
      }
      state.compareProfiles.push(value);
    } else {
      state.compareProfiles = state.compareProfiles.filter((name) => name !== value);
    }
    renderAll();
  });
  $("profilesTable").addEventListener("click", (event) => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) editProfile(editId);
    if (deleteId) deleteProfile(deleteId);
  });
  $("addProfile").addEventListener("click", addProfile);
  $("exportExcel").addEventListener("click", exportExcel);
  $("exportPdf").addEventListener("click", () => window.print());
  $("refreshButton").addEventListener("click", async () => {
    state.data = await dataProvider.load();
    renderAll();
  });
  $("settingsButton").addEventListener("click", () => {
    alert("Configuracoes preparadas para Instagram Graph API, Meta API, TikTok API, YouTube Data API, OpenAI e Gemini.");
  });
}

function addProfile() {
  const name = prompt("Nome do perfil");
  if (!name) return;
  const instagram = prompt("Instagram", `@${name.toLowerCase().replace(/\s+/g, "")}`) || "";
  const category = prompt("Categoria", "Hoteis") || "Hoteis";
  const city = prompt("Cidade", "Porto Seguro") || "Porto Seguro";
  const uf = prompt("Estado", "BA") || "BA";
  state.data.profiles.push({
    id: `profile-${Date.now()}`,
    name,
    instagram,
    category,
    city,
    state: uf,
    status: "Ativo",
    followers: 0,
    growth: 0,
    lastUpdated: new Date().toISOString()
  });
  renderAll();
}

function editProfile(id) {
  const profile = state.data.profiles.find((item) => item.id === id);
  if (!profile) return;
  profile.name = prompt("Nome", profile.name) || profile.name;
  profile.instagram = prompt("Instagram", profile.instagram) || profile.instagram;
  profile.category = prompt("Categoria", profile.category) || profile.category;
  profile.city = prompt("Cidade", profile.city) || profile.city;
  profile.state = prompt("Estado", profile.state) || profile.state;
  profile.status = prompt("Status", profile.status) || profile.status;
  profile.lastUpdated = new Date().toISOString();
  renderAll();
}

function deleteProfile(id) {
  const profile = state.data.profiles.find((item) => item.id === id);
  if (!profile || !confirm(`Excluir ${profile.name}?`)) return;
  state.data.profiles = state.data.profiles.filter((item) => item.id !== id);
  state.compareProfiles = state.compareProfiles.filter((name) => name !== profile.name);
  renderAll();
}

async function init() {
  state.data = await dataProvider.load();
  bindEvents();
  renderAll();
}

init();
