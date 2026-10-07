(function setupUnifiedPortal() {
  const routes = {
    comunicados: { url: "/comunicados", permission: "comunicados", title: "Comunicados" },
    inclusao_comunicados: { url: "/comunicados/admin", permission: "inclusao_comunicados", title: "Inclusão de Comunicados" },
    treinamentos: { url: "/Treinamentos", permission: "treinamentos", title: "Centro de Conhecimentos" },
    treinamentos_publicar: { url: "/Treinamentos/Publicar", permission: "treinamentos_editor", title: "Publicar Conteúdo" },
    treinamentos_modulos: { url: "/Treinamentos/Modulos", permission: "treinamentos_editor", title: "Gerenciar módulos" },
    tv_vendedores: { url: "/dashboard-tv.html", permission: "tv_vendedores", title: "TV Painel Vendedor" },
    ranking_vendedores: { url: "/dashboard-vendedores.html", permission: "ranking_vendedores", title: "Ranking de Vendedores" },
    bi_relatorios: { url: "/bi-relatorios.html?v=20260928-full-channel-hotel-values", permission: "bi_relatorios", title: "BI - Relatórios" },
    bi_relatorios_kpi: { url: "/bi-relatorios-kpi.html?v=20261006-kpi-desktop-panels", permission: "bi_relatorios_kpi", title: "BI - Relatórios by KPI" },
    mapa_ocupacao: { url: "/mapa-ocupacao.html?v=20261007-rotulo-disponibilidade", permission: "mapa_ocupacao", title: "Mapa de ocupação" },
    mesas_vip_reveillon: { url: "/mesas-vip-reveillon", permission: "mesas_vip_reveillon", title: "Mesas VIP Réveillon" },
    opinarios_rede: { url: "/dashboard-operacional-tv.html", permission: "opinarios_rede", title: "Opinários de todos os hotéis" },
    opinarios_plaza: { url: "/operacional/plaza", permission: "opinarios_hotel", title: "Opinários — SUEDS Plaza" },
    opinarios_cabralia: { url: "/operacional/cabralia", permission: "opinarios_hotel", title: "Opinários — SUEDS Cabrália" },
    opinarios_segundo_sol: { url: "/operacional/segundo-sol", permission: "opinarios_hotel", title: "Opinários — SUEDS Segundo Sol" },
    opinarios_premium: { url: "/operacional/premium", permission: "opinarios_hotel", title: "Opinários — SUEDS Premium" },
    opinarios_trancoso: { url: "/operacional/trancoso", permission: "opinarios_hotel", title: "Opinários — SUEDS Trancoso" },
    opinarios_casas: { url: "/operacional/casas-arraial", permission: "opinarios_hotel", title: "Opinários — Casas SUEDS Arraial" },
    redes_sociais: { url: "/dashboard-redes-sociais.html?v=20260811-compact", permission: "redes_sociais", title: "Redes Sociais" },
    marketing_competitividade: { url: "/dashboard-inteligencia-mercado.html", permission: "marketing_competitividade", title: "Marketing e Competitividade" },
    inspecoes: { url: "/inspecoes/dashboard", permission: "inspecoes", title: "Sueds Inspeções" },
    dre_sueds_hotels: { url: "/dre-sueds-hotels.html?v=20261007", permission: "dre_sueds_hotels", title: "DRE Sueds Hotels" },
    simulador_tributario: { url: "/inspecoes/simulador-tributario", permission: "admin_geral", title: "Simulador Tributário" },
    usuarios: { url: "/usuarios?v=20260808-embedded", permission: "admin_geral", title: "Usuários e Acessos" }
  };

  const home = document.getElementById("portalHome");
  const moduleArea = document.getElementById("portalModule");
  const frame = document.getElementById("portalModuleFrame");
  const loading = document.getElementById("portalModuleLoading");
  const header = document.querySelector(".manager-topbar");
  const logoutButton = document.getElementById("portalLogoutButton");
  const announcementBell = document.getElementById("portalAnnouncementBell");
  const announcementBadge = document.getElementById("portalAnnouncementBadge");
  const overdueButton = document.getElementById("portalOverduePayments");
  const overdueBadge = document.getElementById("portalOverdueBadge");
  const overdueDialog = document.getElementById("portalOverdueDialog");
  const overdueList = document.getElementById("portalOverdueList");
  const availabilityButton = document.getElementById("portalAvailabilityAlerts");
  const availabilityBadge = document.getElementById("portalAvailabilityBadge");
  const availabilityDialog = document.getElementById("portalAvailabilityDialog");
  const availabilityList = document.getElementById("portalAvailabilityList");
  const availabilityPeriod = document.getElementById("portalAvailabilityPeriod");
  const availabilityMapLink = document.getElementById("portalAvailabilityMapLink");
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
  let activeModule = "";
  let notificationRequest = 0;
  let availabilityRequest = 0;

  const roleLabels = {
    admin_geral: "Administrador geral",
    gestor_unidade: "Gestor da unidade",
    inspetor: "Inspetor",
    responsavel_correcao: "Responsável pela correção"
  };

  function showUser(profile) {
    const name = String(profile?.name || profile?.email || "Usuário").trim();
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US";
    const role = (profile?.roles || []).map((slug) => roleLabels[slug]).find(Boolean) || "Usuário autorizado";
    const nameElement = document.getElementById("portalUserName");
    const initialsElement = document.getElementById("portalUserInitials");
    const roleElement = document.getElementById("portalUserRole");
    if (nameElement) nameElement.textContent = name;
    if (initialsElement) initialsElement.textContent = initials;
    if (roleElement) roleElement.textContent = role;
  }

  async function logout() {
    if (!logoutButton || logoutButton.disabled) return;
    logoutButton.disabled = true;
    logoutButton.setAttribute("aria-label", "Saindo do portal");
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } finally {
      window.location.replace("/login");
    }
  }

  function hasPermission(route) {
    if (!route) return false;
    if (route.permission === "admin_geral") return window.suedsPortalProfile?.roles?.includes("admin_geral");
    return Boolean(window.suedsPortalAccess?.[route.permission]);
  }

  function updateAnnouncementBell(unreadCount) {
    if (!announcementBell || !announcementBadge) return;
    const count = Math.max(0, Number(unreadCount) || 0);
    const hasUnread = count > 0;
    announcementBadge.textContent = count > 99 ? "99+" : String(count);
    announcementBell.dataset.state = hasUnread ? "unread" : "current";
    announcementBell.hidden = false;
    const label = hasUnread
      ? `${count} comunicado${count === 1 ? " não lido" : "s não lidos"}. Abrir comunicados.`
      : "Nenhum comunicado não lido. Abrir comunicados.";
    announcementBell.setAttribute("aria-label", label);
    announcementBell.title = label;
  }

  async function refreshAnnouncementNotifications() {
    if (!hasPermission(routes.comunicados)) {
      if (announcementBell) announcementBell.hidden = true;
      return;
    }
    const request = ++notificationRequest;
    try {
      const response = await fetch("/api/portal/announcements?summary=1", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível consultar os comunicados.");
      if (request === notificationRequest) updateAnnouncementBell(payload.unreadCount);
    } catch (error) {
      console.error("[portal-announcement-notifications]", error.message || error);
    }
  }

  async function refreshOverduePayments() {
    if (!window.suedsPortalProfile?.roles?.includes("vendedor")) return;
    try {
      const response = await fetch("/api/portal/overdue-payments", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível consultar os pagamentos.");
      const payments = Array.isArray(payload.payments) ? payload.payments : [];
      overdueButton.hidden = payments.length === 0;
      overdueBadge.textContent = payments.length > 99 ? "99+" : String(payments.length);
      const label = `${payments.length} pagamento${payments.length === 1 ? "" : "s"} atrasado${payments.length === 1 ? "" : "s"}. Abrir lista.`;
      overdueButton.setAttribute("aria-label", label);
      overdueButton.title = label;
      overdueList.replaceChildren();
      payments.forEach((payment) => {
        const item = document.createElement("div");
        item.className = "portal-overdue-item";
        const details = document.createElement("div");
        const code = document.createElement("strong");
        code.textContent = payment.reservationCode;
        const hotel = document.createElement("span");
        hotel.textContent = payment.hotel;
        const date = document.createElement("span");
        date.textContent = `Venda em ${day.format(new Date(`${payment.saleDate}T00:00:00Z`))} · ${payment.daysSinceSale} dias`;
        details.append(code, hotel, date);
        const amount = document.createElement("div");
        amount.className = "portal-overdue-amount";
        const value = document.createElement("strong");
        value.textContent = money.format(payment.amount);
        const status = document.createElement("span");
        status.textContent = "Atrasado";
        amount.append(value, status);
        item.append(details, amount);
        overdueList.append(item);
      });
    } catch (error) {
      overdueButton.hidden = true;
      console.error("[portal-overdue-payments]", error.message || error);
    }
  }

  function availabilityDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit" }).format(new Date(`${value}T12:00:00Z`));
  }

  function availabilityMonth(value) {
    const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" }).format(new Date(`${value}T12:00:00Z`)).replace(".", "");
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function renderAvailabilityAlerts(payload) {
    const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
    const count = alerts.reduce((total, hotel) => total + (hotel.days || []).length, 0);
    availabilityBadge.textContent = count > 99 ? "99+" : String(count);
    availabilityButton.hidden = false;
    const label = count ? `${count} alerta${count === 1 ? "" : "s"} de disponibilidade. Abrir resumo.` : "Sem alertas de disponibilidade. Abrir resumo.";
    availabilityButton.setAttribute("aria-label", label);
    availabilityButton.title = label;
    const updatedAt = payload.updatedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(payload.updatedAt)) : "não informada";
    availabilityPeriod.textContent = `Última atualização do KPI: ${updatedAt}. De ${day.format(new Date(`${payload.period.start}T12:00:00Z`))} até ${day.format(new Date(`${payload.period.end}T12:00:00Z`))}. Dias com 3 ou menos aptos. disponíveis.`;
    availabilityList.replaceChildren();
    if (!alerts.length) {
      const empty = document.createElement("p");
      empty.className = "portal-overdue-empty";
      empty.textContent = "Não há dias com baixa disponibilidade no período consultado.";
      availabilityList.append(empty);
      return;
    }
    alerts.forEach((hotel) => {
      const item = document.createElement("article");
      item.className = "portal-availability-item";
      const title = document.createElement("strong");
      title.textContent = hotel.hotel;
      const text = document.createElement("span");
      const grouped = new Map();
      hotel.days.forEach((item) => {
        const month = availabilityMonth(item.date);
        if (!grouped.has(month)) grouped.set(month, []);
        grouped.get(month).push(availabilityDate(item.date));
      });
      text.textContent = [...grouped.entries()].map(([month, dates]) => `${month}: ${dates.join(", ")}`).join(" · ");
      item.append(title, text);
      availabilityList.append(item);
    });
  }

  async function refreshAvailabilityAlerts() {
    if (!window.suedsPortalAccess?.alertas_disponibilidade) {
      availabilityButton.hidden = true;
      return;
    }
    availabilityButton.hidden = false;
    const request = ++availabilityRequest;
    try {
      const response = await fetch("/api/portal/availability-alerts", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Não foi possível consultar a disponibilidade.");
      if (request === availabilityRequest) renderAvailabilityAlerts(payload);
    } catch (error) {
      if (request === availabilityRequest) {
        availabilityBadge.textContent = "!";
        availabilityButton.setAttribute("aria-label", "Alertas de disponibilidade indisponíveis. Abrir resumo.");
        availabilityButton.title = "Alertas de disponibilidade indisponíveis. Abrir resumo.";
        availabilityPeriod.textContent = "Não foi possível atualizar a disponibilidade agora.";
        availabilityList.replaceChildren();
        const unavailable = document.createElement("p");
        unavailable.className = "portal-overdue-empty";
        unavailable.textContent = "Tente novamente em alguns instantes ou consulte o Mapa de ocupação.";
        availabilityList.append(unavailable);
      }
      console.error("[portal-availability-alerts]", error.message || error);
    }
  }

  function updateHeaderHeight() {
    const height = header?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--portal-header-height", `${Math.ceil(height)}px`);
  }

  function setActiveButton(moduleKey) {
    document.querySelectorAll(".manager-shortcut[data-portal-home], [data-portal-module], [data-portal-group]").forEach((element) => {
      const selected = (!moduleKey && element.hasAttribute("data-portal-home")) ||
        element.dataset.portalModule === moduleKey ||
        (moduleKey.startsWith("opinarios_") && moduleKey !== "opinarios_rede" && element.dataset.portalGroup === "opinarios_hotel");
      element.classList.toggle("active", selected);
      if (element.matches("a,button")) element.setAttribute("aria-current", selected ? "page" : "false");
    });
    window.suedsPortalNavigation?.sync(moduleKey, routes[moduleKey]?.title);
  }

  function writeHistory(moduleKey, replace) {
    const url = new URL(window.location.href);
    if (moduleKey) url.searchParams.set("modulo", moduleKey);
    else url.searchParams.delete("modulo");
    window.history[replace ? "replaceState" : "pushState"]({ module: moduleKey }, "", url);
  }

  function showHome(options = {}) {
    if (document.documentElement.classList.contains("site-preview-only")) {
      activeModule = "";
      document.body.classList.remove("portal-module-open");
      home.hidden = true;
      moduleArea.hidden = true;
      frame.removeAttribute("src");
      setActiveButton("");
      updateHeaderHeight();
      return;
    }
    if (!window.suedsPortalAccess?.painel_gestores) {
      const fallback = Object.keys(routes).find((key) => hasPermission(routes[key]));
      if (fallback) showModule(fallback, { replace: Boolean(options.replace) });
      return;
    }
    activeModule = "";
    document.body.classList.remove("portal-module-open");
    home.hidden = false;
    moduleArea.hidden = true;
    frame.removeAttribute("src");
    setActiveButton("");
    document.querySelectorAll("[data-home-only]").forEach((element) => { element.hidden = false; });
    document.title = "SUEDS Hotels | Gestores";
    updateHeaderHeight();
    if (!options.fromHistory) writeHistory("", Boolean(options.replace));
    window.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
  }

  function showModule(moduleKey, options = {}) {
    const route = routes[moduleKey];
    if (!route || !hasPermission(route)) {
      showHome({ replace: true, instant: true });
      return;
    }
    activeModule = moduleKey;
    home.hidden = true;
    moduleArea.hidden = false;
    loading.hidden = false;
    frame.hidden = true;
    document.body.classList.add("portal-module-open");
    document.querySelectorAll("[data-home-only]").forEach((element) => { element.hidden = true; });
    setActiveButton(moduleKey);
    document.title = `${route.title} | Portal SUEDS`;
    updateHeaderHeight();
    if (!options.fromHistory) writeHistory(moduleKey, Boolean(options.replace));
    if (frame.getAttribute("src") !== route.url) frame.src = route.url;
    else {
      frame.hidden = false;
      loading.hidden = true;
    }
  }

  frame.addEventListener("load", () => {
    if (!activeModule) return;
    loading.hidden = true;
    frame.hidden = false;
    try {
      const childTitle = frame.contentDocument?.title;
      if (childTitle) frame.title = childTitle;
    } catch {}
  });

  announcementBell?.addEventListener("click", () => showModule("comunicados"));
  overdueButton?.addEventListener("click", () => overdueDialog?.showModal());
  availabilityButton?.addEventListener("click", () => availabilityDialog?.showModal());
  document.getElementById("portalOverdueClose")?.addEventListener("click", () => overdueDialog?.close());
  document.getElementById("portalAvailabilityClose")?.addEventListener("click", () => availabilityDialog?.close());
  availabilityMapLink?.addEventListener("click", (event) => {
    event.preventDefault();
    availabilityDialog?.close();
    showModule("mapa_ocupacao");
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.type !== "sueds:announcement-status") return;
    updateAnnouncementBell(event.data.unreadCount);
  });
  window.addEventListener("focus", refreshAnnouncementNotifications);
  window.addEventListener("focus", refreshOverduePayments);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshAnnouncementNotifications();
      refreshOverduePayments();
      refreshAvailabilityAlerts();
    }
  });

  document.addEventListener("click", (event) => {
    const homeLink = event.target.closest("[data-portal-home]");
    if (homeLink) {
      event.preventDefault();
      showHome();
      return;
    }
    const link = event.target.closest("a[data-portal-module]");
    if (!link) return;
    event.preventDefault();
    document.getElementById("hotelOpinionModal")?.setAttribute("hidden", "");
    showModule(link.dataset.portalModule);
  });

  window.addEventListener("popstate", () => {
    const moduleKey = new URLSearchParams(window.location.search).get("modulo") || "";
    if (moduleKey) showModule(moduleKey, { fromHistory: true });
    else showHome({ fromHistory: true, instant: true });
  });

  if (header && "ResizeObserver" in window) new ResizeObserver(updateHeaderHeight).observe(header);
  window.addEventListener("resize", updateHeaderHeight);
  logoutButton?.addEventListener("click", logout);

  Promise.resolve(window.suedsManagerAuthReady).then(() => {
    showUser(window.suedsPortalProfile);
    const isAdmin = window.suedsPortalProfile?.roles?.includes("admin_geral");
    if (document.documentElement.classList.contains("site-preview-only")) {
      document.querySelectorAll("[data-home-only], #portalHome, #openTvMessageModal, #openHotelOpinionModal").forEach((element) => {
        element.hidden = true;
      });
    }
    const hotelCodes = new Set((window.suedsPortalProfile?.hotels || []).map((hotel) => hotel.code));
    document.querySelectorAll("[data-hotel-code]").forEach((element) => {
      element.hidden = !isAdmin && !hotelCodes.has(element.dataset.hotelCode);
    });
    window.suedsPortalNavigation?.init();
    const requestedModule = new URLSearchParams(window.location.search).get("modulo") || "";
    if (requestedModule) showModule(requestedModule, { replace: true });
    else showHome({ replace: true, instant: true });
    updateHeaderHeight();
    refreshAnnouncementNotifications();
    refreshOverduePayments();
    refreshAvailabilityAlerts();
  });
})();
