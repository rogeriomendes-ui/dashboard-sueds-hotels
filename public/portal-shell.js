(function setupUnifiedPortal() {
  const routes = {
    tv_vendedores: { url: "/dashboard-tv.html", permission: "tv_vendedores", title: "TV Painel Vendedor" },
    ranking_vendedores: { url: "/dashboard-vendedores.html", permission: "ranking_vendedores", title: "Ranking de Vendedores" },
    opinarios_rede: { url: "/dashboard-operacional-tv.html", permission: "opinarios_rede", title: "Opinários de todos os hotéis" },
    opinarios_plaza: { url: "/operacional/plaza", permission: "opinarios_hotel", title: "Opinários — SUEDS Plaza" },
    opinarios_cabralia: { url: "/operacional/cabralia", permission: "opinarios_hotel", title: "Opinários — SUEDS Cabrália" },
    opinarios_segundo_sol: { url: "/operacional/segundo-sol", permission: "opinarios_hotel", title: "Opinários — SUEDS Segundo Sol" },
    opinarios_premium: { url: "/operacional/premium", permission: "opinarios_hotel", title: "Opinários — SUEDS Premium" },
    opinarios_trancoso: { url: "/operacional/trancoso", permission: "opinarios_hotel", title: "Opinários — SUEDS Trancoso" },
    opinarios_casas: { url: "/operacional/casas-arraial", permission: "opinarios_hotel", title: "Opinários — Casas SUEDS Arraial" },
    redes_sociais: { url: "/dashboard-redes-sociais.html?v=20260811-cleanup", permission: "redes_sociais", title: "Redes Sociais" },
    marketing_competitividade: { url: "/dashboard-inteligencia-mercado.html", permission: "marketing_competitividade", title: "Marketing e Competitividade" },
    inspecoes: { url: "/inspecoes/dashboard", permission: "inspecoes", title: "Sueds Inspeções" },
    usuarios: { url: "/usuarios?v=20260808-embedded", permission: "admin_geral", title: "Usuários e Acessos" }
  };

  const home = document.getElementById("portalHome");
  const moduleArea = document.getElementById("portalModule");
  const frame = document.getElementById("portalModuleFrame");
  const loading = document.getElementById("portalModuleLoading");
  const header = document.querySelector(".manager-topbar");
  const logoutButton = document.getElementById("portalLogoutButton");
  let activeModule = "";

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
  }

  function writeHistory(moduleKey, replace) {
    const url = new URL(window.location.href);
    if (moduleKey) url.searchParams.set("modulo", moduleKey);
    else url.searchParams.delete("modulo");
    window.history[replace ? "replaceState" : "pushState"]({ module: moduleKey }, "", url);
  }

  function showHome(options = {}) {
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
    const hotelCodes = new Set((window.suedsPortalProfile?.hotels || []).map((hotel) => hotel.code));
    document.querySelectorAll("[data-hotel-code]").forEach((element) => {
      element.hidden = !isAdmin && !hotelCodes.has(element.dataset.hotelCode);
    });
    const requestedModule = new URLSearchParams(window.location.search).get("modulo") || "";
    if (requestedModule) showModule(requestedModule, { replace: true });
    else showHome({ replace: true, instant: true });
    updateHeaderHeight();
  });
})();
