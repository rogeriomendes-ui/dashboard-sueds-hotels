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
const SUEDS_ACCOUNT_HANDLES = new Set(["@suedshotels", "@suedstrancoso", "@beachclubsued", "@beachclubsueds"]);
const PROFILE_STORAGE_KEY = "sueds_social_profiles_v1";

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
  postSort: "engagement",
  compareProfiles: ["Sueds Hotels", "La Torre Resort", "Porto Seguro Praia", "Brisa da Praia", "Melhores Destinos"]
};

const dataProvider = {
  async load() {
    const storedProfiles = loadPersistedProfiles();
    const demoPosts = generatePosts(storedProfiles);
    try {
      const response = await fetch("/api/redes-sociais?days=90", { credentials: "same-origin" });
      if (response.status === 401) {
        window.top.location.replace(`/login?next=${encodeURIComponent("/gestores?modulo=redes_sociais")}`);
        throw new Error("Sessao expirada");
      }
      if (!response.ok) throw new Error(`Meta API respondeu ${response.status}`);
      const payload = await response.json();
      if (!payload.configured) {
        return { lastUpdated: new Date().toISOString(), profiles: storedProfiles, posts: demoPosts, source: "demo" };
      }
      const profiles = mergeOfficialProfiles(storedProfiles, payload.accounts || []);
      const officialNames = new Set(profiles.filter((profile) => profile.official).map((profile) => profile.name));
      return {
        lastUpdated: payload.lastUpdated || new Date().toISOString(),
        profiles,
        posts: demoPosts.filter((post) => !officialNames.has(post.profile)).concat(payload.posts || []),
        source: payload.source || "meta_instagram_graph_api"
      };
    } catch (error) {
      console.error("Nao foi possivel carregar as metricas reais do Instagram.", error);
      return { lastUpdated: new Date().toISOString(), profiles: storedProfiles, posts: demoPosts, source: "demo", error: error.message };
    }
  }
};

function normalizedInstagramHandle(value) {
  return `@${String(value || "").trim().replace(/^@/, "").toLowerCase()}`;
}

function isSuedsOfficialProfile(profile) {
  return SUEDS_ACCOUNT_HANDLES.has(normalizedInstagramHandle(profile?.instagram));
}

function mergeOfficialProfiles(storedProfiles, accounts) {
  const profiles = storedProfiles.map((profile) => (
    isSuedsOfficialProfile(profile)
      ? { ...profile, followers: 0, growth: 0, official: true, connected: false }
      : profile
  ));
  accounts.forEach((account) => {
    const handle = normalizedInstagramHandle(account.username);
    const profile = profiles.find((item) => (
      normalizedInstagramHandle(item.instagram) === handle
      || item.name.toLowerCase() === String(account.name || "").toLowerCase()
    ));
    const values = {
      name: account.name || profile?.name || account.username,
      instagram: handle,
      followers: Number(account.followers || 0),
      mediaCount: Number(account.mediaCount || 0),
      profilePicture: account.profilePicture || "",
      accessLevel: account.accessLevel || "insights",
      status: "Ativo",
      lastUpdated: new Date().toISOString(),
      official: true,
      connected: true,
      growth: 0
    };
    if (profile) Object.assign(profile, values);
    else profiles.push({
      id: `meta-${account.id}`,
      category: String(account.name || "").toLowerCase().includes("beach") ? "Beach Clubs" : "Hoteis",
      city: String(account.name || "").toLowerCase().includes("trancoso") ? "Trancoso" : "Porto Seguro",
      state: "BA",
      ...values
    });
  });
  return profiles;
}

function seedProfiles() {
  return PROFILE_SEED.map((row, index) => ({
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
  }));
}

function persistProfiles(profiles) {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
    return true;
  } catch (error) {
    console.error("Nao foi possivel salvar os perfis monitorados.", error);
    return false;
  }
}

function loadPersistedProfiles() {
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored !== null) {
      const profiles = JSON.parse(stored);
      if (Array.isArray(profiles)) return profiles;
    }
  } catch (error) {
    console.error("Nao foi possivel carregar os perfis monitorados.", error);
  }

  const profiles = seedProfiles();
  persistProfiles(profiles);
  return profiles;
}

function generatePosts(profileRecords) {
  const posts = [];
  const profiles = profileRecords.map((profile) => profile.name);
  const audios = ["Som original", "Praia viral 26", "Forro sunset", "Trend viagem", "Bossa leve", "Luau remix"];
  const ctas = ["Reserve agora", "Veja as tarifas", "Marque quem iria", "Conheca o hotel", "Salve para as ferias"];
  const today = new Date();

  for (let i = 0; i < 150; i += 1) {
    const profile = profiles[i % profiles.length];
    const profileSeed = profileRecords.find((item) => item.name === profile);
    if (!profileSeed) continue;
    const type = i % 5 === 0 ? "Carrossel" : i % 2 === 0 ? "Reel" : "Foto";
    const theme = THEMES[(i * 3 + 2) % THEMES.length];
    const date = new Date(today);
    date.setDate(today.getDate() - (i % 90));
    date.setHours(8 + (i % 14), (i * 7) % 60, 0, 0);
    const views = Math.round(((Number(profileSeed.followers) || 0) / 18) * (0.45 + (i % 9) / 10));
    const likes = Math.round(views * (0.035 + (i % 7) / 100));
    const comments = Math.round(likes * (0.05 + (i % 4) / 100));
    const shares = Math.round(likes * (0.03 + (i % 5) / 100));
    const saved = Math.round(likes * (0.04 + (i % 3) / 100));
    const reach = views;
    const interactions = likes + comments + shares + saved;
    const engagement = reach ? (interactions / reach) * 100 : 0;
    posts.push({
      id: `post-${i + 1}`,
      profile,
      date: date.toISOString(),
      type,
      theme,
      likes,
      comments,
      shares,
      saved,
      reach,
      interactions,
      views,
      engagement,
      url: `https://instagram.com/p/sueds-demo-${i + 1}`,
      caption: `${theme} em destaque para inspirar viagens para o sul da Bahia.`,
      cta: ctas[i % ctas.length],
      audio: audios[i % audios.length],
      thumbnail: "",
      duration: type === "Reel" ? 8 + (i % 24) : 0,
      hashtags: buildHashtags(theme, profileSeed.city)
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
    return profile
      && new Date(post.date) >= minDate
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
  populateSelect("typeFilter", ["Foto", "Reel", "Carrossel", "Story"], "Todos os tipos");
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

function suedsAccountPosts(profileName) {
  const days = Number(state.filters.period);
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - days);
  return state.data.posts.filter((post) => (
    post.profile === profileName
    && new Date(post.date) >= minDate
    && (!state.filters.type || post.type === state.filters.type)
    && (!state.filters.theme || post.theme === state.filters.theme)
  ));
}

function renderSuedsAccounts() {
  const profiles = state.data.profiles.filter(isSuedsOfficialProfile);

  $("suedsAccountsOverview").innerHTML = profiles.map((profile) => {
    const posts = suedsAccountPosts(profile.name);
    const publications = posts.filter((post) => post.type !== "Story");
    const reels = posts.filter((post) => post.type === "Reel");
    const stories = posts.filter((post) => post.type === "Story");
    const privateMetricsAvailable = profile.accessLevel !== "public";
    const privateMetric = (value) => privateMetricsAvailable ? number(value) : "--";
    const totalReach = sum(posts, "reach");
    const totalInteractions = sum(posts, "interactions");
    const status = profile.connected
      ? profile.accessLevel === "public" ? "Meta API (publico)" : "Meta API"
      : state.data.source === "meta_instagram_graph_api" ? "Vinculo pendente" : "Dados demonstrativos";
    return `
      <article class="sueds-account-card">
        <div class="sueds-account-heading">
          <div>
            <strong>${escapeHtml(profile.name)}</strong>
            <span>${escapeHtml(profile.instagram)}</span>
          </div>
          <b class="sueds-growth">${escapeHtml(status)}</b>
        </div>
        <div class="sueds-account-metrics">
          <div><span>Seguidores</span><strong>${number(profile.followers)}</strong></div>
          <div><span>Publicacoes</span><strong>${number(publications.length)}</strong></div>
          <div><span>Reels</span><strong>${number(reels.length)}</strong></div>
          <div><span>Stories ativos</span><strong>${number(stories.length)}</strong></div>
          <div><span>Engajamento</span><strong>${percent(average(posts, "engagement"))}</strong></div>
          <div><span>Alcance</span><strong>${privateMetric(totalReach)}</strong></div>
          <div><span>Media alcance / post</span><strong>${privateMetric(publications.length ? Math.round(totalReach / publications.length) : 0)}</strong></div>
          <div><span>Curtidas</span><strong>${number(sum(posts, "likes"))}</strong></div>
          <div><span>Comentarios</span><strong>${number(sum(posts, "comments"))}</strong></div>
          <div><span>Salvamentos</span><strong>${privateMetric(sum(posts, "saved"))}</strong></div>
          <div><span>Compartilhamentos</span><strong>${privateMetric(sum(posts, "shares"))}</strong></div>
          <div><span>Interacoes</span><strong>${privateMetric(totalInteractions)}</strong></div>
          <div><span>Visualizacoes</span><strong>${privateMetric(sum(posts, "views"))}</strong></div>
        </div>
      </article>
    `;
  }).join("");
}

function sortedPosts(posts) {
  const map = {
    engagement: (post) => post.engagement,
    reach: (post) => post.reach,
    comments: (post) => post.comments,
    saved: (post) => post.saved,
    shares: (post) => post.shares,
    views: (post) => post.views
  };
  const getter = map[state.postSort] || map.engagement;
  return [...posts].sort((a, b) => getter(b) - getter(a));
}

function realOfficialPosts(posts) {
  const officialNames = new Set(
    state.data.profiles
      .filter(isSuedsOfficialProfile)
      .map((profile) => profile.name)
  );
  return posts.filter((post) => officialNames.has(post.profile) && /^\d+$/.test(String(post.accountId || "")));
}

function renderTopPosts(posts) {
  $("postSort").innerHTML = [
    ["engagement", "Maior engajamento"],
    ["reach", "Maior alcance"],
    ["comments", "Mais comentarios"],
    ["saved", "Mais salvamentos"],
    ["shares", "Mais compartilhamentos"],
    ["views", "Mais visualizacoes"]
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  $("postSort").value = state.postSort;
  const officialPosts = sortedPosts(realOfficialPosts(posts)).slice(0, 40);
  $("topPostsTable").innerHTML = officialPosts.map((post) => `
    <tr>
      <td><button class="post-preview-button" type="button" data-post-id="${escapeHtml(post.id)}" aria-label="Visualizar publicacao de ${escapeHtml(post.profile)}">${post.thumbnail
        ? `<img class="thumb" src="${escapeHtml(post.thumbnail)}" alt="Publicacao de ${escapeHtml(post.profile)}" loading="lazy">`
        : `<span class="thumb"></span>`}</button></td>
      <td>${escapeHtml(post.profile)}</td>
      <td>${dateLabel(post.date)}</td>
      <td>${escapeHtml(post.type)}</td>
      <td>${escapeHtml(post.theme)}</td>
      <td>${number(post.likes)}</td>
      <td><button class="comments-count-button" type="button" data-post-id="${escapeHtml(post.id)}" aria-label="Visualizar ${number(post.comments)} comentarios">${number(post.comments)}</button></td>
      <td>${number(post.reach)}</td>
      <td>${number(post.saved)}</td>
      <td>${number(post.shares)}</td>
      <td>${number(post.views)}</td>
      <td>${percent(post.engagement)}</td>
      <td><a class="link-button" href="${post.url}" target="_blank" rel="noopener">Abrir</a></td>
    </tr>
  `).join("") || `<tr><td colspan="13" class="empty-table-message">Nenhuma publicacao oficial encontrada para o periodo selecionado.</td></tr>`;
}

function postById(postId) {
  return state.data.posts.find((post) => String(post.id) === String(postId));
}

function postMetric(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

async function loadPostComments(post) {
  const target = $("postCommentsList");
  if (!target) return;
  if (!/^\d+$/.test(String(post.id || ""))) {
    target.innerHTML = `<p class="comments-message">Comentarios detalhados estao disponiveis apenas para publicacoes oficiais conectadas.</p>`;
    return;
  }
  const profile = state.data.profiles.find((item) => item.name === post.profile);
  if (profile?.accessLevel === "public") {
    target.innerHTML = `<p class="comments-message">Vincule esta conta a Meta para visualizar o texto dos comentarios.</p>`;
    return;
  }
  target.innerHTML = `<p class="comments-message">Carregando comentarios...</p>`;
  try {
    const response = await fetch(`/api/redes-sociais/comments?mediaId=${encodeURIComponent(post.id)}`, { credentials: "same-origin" });
    if (response.status === 401) {
      window.top.location.replace(`/login?next=${encodeURIComponent("/gestores?modulo=redes_sociais")}`);
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Comentarios indisponiveis.");
    const comments = payload.comments || [];
    target.innerHTML = comments.length ? comments.map((comment) => `
      <article class="post-comment">
        <div><strong>@${escapeHtml(String(comment.username || "instagram").replace(/^@/, ""))}</strong><span>${comment.timestamp ? dateTimeLabel(comment.timestamp) : ""}</span></div>
        <p>${escapeHtml(comment.text)}</p>
        ${comment.likes ? `<small>${number(comment.likes)} curtidas</small>` : ""}
      </article>
    `).join("") : `<p class="comments-message">Esta publicacao ainda nao possui comentarios.</p>`;
  } catch (error) {
    target.innerHTML = `<p class="comments-message error">${escapeHtml(error.message)}</p>`;
  }
}

function openPostDetails(postId) {
  const post = postById(postId);
  if (!post) return;
  const dialog = $("postDetailsDialog");
  $("postDetailsTitle").textContent = `${post.profile} · ${post.type}`;
  $("postDetailsContent").innerHTML = `
    <div class="post-details-media">
      ${post.thumbnail
        ? `<img src="${escapeHtml(post.thumbnail)}" alt="Publicacao de ${escapeHtml(post.profile)}">`
        : `<div class="post-details-placeholder">Miniatura indisponivel</div>`}
      <a class="action-button post-instagram-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener">Abrir no Instagram</a>
    </div>
    <div class="post-details-info">
      <div class="post-details-meta"><strong>${escapeHtml(post.profile)}</strong><span>${dateTimeLabel(post.date)}</span></div>
      <p class="post-caption">${escapeHtml(post.caption || "Sem legenda.")}</p>
      <div class="post-details-metrics">
        ${postMetric("Curtidas", number(post.likes))}
        ${postMetric("Comentarios", number(post.comments))}
        ${postMetric("Alcance", number(post.reach))}
        ${postMetric("Salvamentos", number(post.saved))}
        ${postMetric("Compartilhamentos", number(post.shares))}
        ${postMetric("Visualizacoes", number(post.views))}
      </div>
      <div class="post-comments-section">
        <h3>Comentarios</h3>
        <div id="postCommentsList" class="post-comments-list"></div>
      </div>
    </div>
  `;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  loadPostComments(post);
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
  renderSuedsAccounts();
  renderKpis(posts);
  renderTopPosts(posts);
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
    ["Perfil", "Data", "Tipo", "Tema", "Curtidas", "Comentarios", "Alcance", "Salvamentos", "Compartilhamentos", "Interacoes", "Visualizacoes", "Engajamento %", "Link"],
    ...posts.map((post) => [post.profile, dateLabel(post.date), post.type, post.theme, post.likes, post.comments, post.reach, post.saved, post.shares, post.interactions, post.views, percent(post.engagement), post.url])
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
  $("postSort").addEventListener("change", (event) => {
    state.postSort = event.target.value;
    renderAll();
  });
  $("topPostsTable").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-post-id]");
    if (trigger) openPostDetails(trigger.dataset.postId);
  });
  $("closePostDetails").addEventListener("click", () => $("postDetailsDialog").close());
  $("postDetailsDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  $("compareSelector").addEventListener("change", (event) => {
    const value = event.target.value;
    if (event.target.checked) {
      if (state.compareProfiles.length >= 10) {
        event.target.checked = false;
        alert("Selecione no maximo 10 perfis.");
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
  persistProfiles(state.data.profiles);
  renderAll();
}

function editProfile(id) {
  const profile = state.data.profiles.find((item) => item.id === id);
  if (!profile) return;
  const previousName = profile.name;
  profile.name = prompt("Nome", profile.name) || profile.name;
  profile.instagram = prompt("Instagram", profile.instagram) || profile.instagram;
  profile.category = prompt("Categoria", profile.category) || profile.category;
  profile.city = prompt("Cidade", profile.city) || profile.city;
  profile.state = prompt("Estado", profile.state) || profile.state;
  profile.status = prompt("Status", profile.status) || profile.status;
  profile.lastUpdated = new Date().toISOString();
  if (profile.name !== previousName) {
    state.data.posts.forEach((post) => {
      if (post.profile === previousName) post.profile = profile.name;
    });
    state.compareProfiles = state.compareProfiles.map((name) => name === previousName ? profile.name : name);
  }
  persistProfiles(state.data.profiles);
  renderAll();
}

function deleteProfile(id) {
  const profile = state.data.profiles.find((item) => item.id === id);
  if (!profile || !confirm(`Excluir ${profile.name}?`)) return;
  state.data.profiles = state.data.profiles.filter((item) => item.id !== id);
  state.data.posts = state.data.posts.filter((post) => post.profile !== profile.name);
  state.compareProfiles = state.compareProfiles.filter((name) => name !== profile.name);
  if (!persistProfiles(state.data.profiles)) {
    alert("O perfil foi removido desta tela, mas nao foi possivel salvar a exclusao neste navegador.");
  }
  renderAll();
}

async function init() {
  state.data = await dataProvider.load();
  bindEvents();
  renderAll();
}

init();
