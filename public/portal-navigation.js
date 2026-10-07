(function setupPortalNavigation() {
  const sidebar = document.getElementById("portalSidebar");
  const main = document.getElementById("portalMain");
  const toggle = document.getElementById("portalMenuToggle");
  const closeButton = document.getElementById("portalSidebarClose");
  const backdrop = document.getElementById("portalSidebarBackdrop");
  const favoritesList = document.getElementById("portalFavoritesList");
  const mobile = window.matchMedia("(max-width: 900px)");
  const items = new Map();
  const rail = document.createElement("nav");
  rail.className = "portal-icon-rail";
  rail.setAttribute("aria-label", "Atalhos do menu recolhido");
  rail.hidden = true;
  sidebar.before(rail);
  const iconPaths = {
    comunicados: 'M4 5h16v12H8l-4 4zM8 9h8M8 13h5',
    inclusao_comunicados: 'M4 5h16v14H4zM12 9v6M9 12h6',
    vendas: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    "Comercial": 'M4 20V10m8 10V4m8 16v-7',
    "Operação": 'M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12l2 2 5-5',
    "Marketing e Site": 'M3 10v5h4l11 5V5L7 10H3m4 5 2 6m12-12v7',
    "Conhecimento": 'M12 5v16M3 3l9 2 9-2v16l-9 2-9-2z',
    "Universidade SUEDS": 'M12 5v16M3 3l9 2 9-2v16l-9 2-9-2z',
    "Administração": 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6',
    tv_vendedores: 'M3 4h18v13H3zM8 21h8m-4-4v4',
    mensagens_tv: 'M3 3h18v14H9l-6 4zM7 8h10M7 12h7',
    ranking_vendedores: 'M8 3h8v9l-4 4-4-4zM8 5H4v5l4 2m8-7h4v5l-4 2m-4 4v5m-4 0h8',
    bi_relatorios: 'M4 19V9m5 10V5m5 14v-7m5 7V3M2 21h20',
    bi_relatorios_kpi: 'M4 19V9m5 10V5m5 14v-7m5 7V3M2 21h20',
    mapa_ocupacao: 'M3 5h18v16H3zM7 3v4m10-4v4M7 11h3m4 0h3M7 15h3m4 0h3',
    mesas_vip_reveillon: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    redes_sociais: 'M8 12l8-6M8 12l8 6M8 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0M22 5a3 3 0 1 0-6 0 3 3 0 0 0 6 0M22 19a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    usuarios: 'M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 21v-3a8 8 0 0 1 16 0v3',
    dre_sueds_hotels: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
    simulador_tributario: 'M5 2h14v20H5zM8 5h8v4H8zM8 13h2m4 0h2m-8 4h2m4 0h2',
    gerenciar_site: 'M3 3h18v18H3zM3 8h18M7 5h1m3 0h1M7 12h10M7 16h6',
    gerenciar_portal_agente: 'M4 5h16v14H4zM8 9h8M8 13h5',
    site_novo_preview: 'M3 12s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7m12 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0'
  };

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", iconPaths[name] || iconPaths.Comercial);
    svg.append(path);
    return svg;
  }

  function renderRail() {
    rail.replaceChildren();
    if (favorites.length) {
      const shortcuts = document.createElement("div");
      shortcuts.className = "portal-rail-favorites";
      for (const key of favorites) {
        const item = items.get(key);
        if (!item) continue;
        const link = item.element.cloneNode(false);
        link.removeAttribute("id");
        link.className = "portal-rail-button manager-shortcut";
        link.title = item.label;
        link.setAttribute("aria-label", item.label);
        link.append(icon(iconPaths[key] ? key : item.category));
        if (link.tagName === "BUTTON") link.addEventListener("click", () => item.element.click());
        shortcuts.append(link);
      }
      rail.append(shortcuts);
    }
    sidebar.querySelectorAll(".portal-nav-group").forEach((group) => {
      if (group.hidden) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "portal-rail-button";
      button.dataset.railCategory = group.dataset.navCategory;
      button.title = group.dataset.navCategory;
      button.setAttribute("aria-label", `Abrir ${group.dataset.navCategory}`);
      button.append(icon(group.dataset.navCategory));
      button.addEventListener("click", () => {
        collapsed = false;
        savePreferences();
        updateMenu();
        group.open = true;
        group.querySelector("summary").focus();
      });
      rail.append(button);
    });
  }
  let favorites = [];
  let storageKey = "";
  let collapsed = false;
  let drawerOpen = false;
  let currentModule = "";
  let currentTitle = "";

  function savePreferences() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ favorites, collapsed })); } catch {}
  }

  function updateMenu() {
    const visible = mobile.matches ? drawerOpen : !collapsed;
    sidebar.hidden = !visible;
    rail.hidden = mobile.matches || !collapsed;
    document.body.classList.toggle("portal-sidebar-collapsed", !visible);
    document.body.classList.toggle("portal-drawer-open", mobile.matches && visible);
    main.inert = mobile.matches && visible;
    backdrop.hidden = !mobile.matches || !visible;
    toggle.setAttribute("aria-expanded", String(visible));
    const label = visible ? "Recolher menu" : "Abrir menu";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    if (mobile.matches && visible) {
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-modal", "true");
    } else {
      sidebar.removeAttribute("role");
      sidebar.removeAttribute("aria-modal");
    }
  }

  function closeDrawer(restoreFocus = true) {
    if (!drawerOpen) return;
    drawerOpen = false;
    updateMenu();
    if (restoreFocus) toggle.focus();
  }

  function starButton(key) {
    const selected = favorites.includes(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "portal-favorite-button";
    button.dataset.favoriteKey = key;
    button.setAttribute("aria-pressed", String(selected));
    button.title = `${selected ? "Remover dos" : "Adicionar aos"} favoritos: ${items.get(key).label}`;
    button.setAttribute("aria-label", button.title);
    button.textContent = selected ? "★" : "☆";
    return button;
  }

  function renderFavorites() {
    favoritesList.replaceChildren();
    for (const key of favorites) {
      const item = items.get(key);
      if (!item) continue;
      const row = document.createElement("div");
      row.className = "portal-nav-row";
      const link = item.element.cloneNode(true);
      link.removeAttribute("id");
      // Modal actions keep their existing handlers on the original buttons.
      if (link.tagName === "BUTTON") {
        link.addEventListener("click", () => item.element.click());
      }
      row.append(link, starButton(key));
      favoritesList.append(row);
    }
    document.getElementById("portalFavoritesEmpty").hidden = favoritesList.childElementCount > 0;
    sidebar.querySelectorAll(".portal-group-items [data-favorite-key], .portal-standalone-row [data-favorite-key]").forEach((button) => {
      const replacement = starButton(button.dataset.favoriteKey);
      button.replaceWith(replacement);
    });
    renderRail();
    sync(currentModule, currentTitle);
  }

  function sync(moduleKey, title) {
    currentModule = moduleKey;
    currentTitle = title;
    const key = !moduleKey ? "vendas" : moduleKey.startsWith("opinarios_") && moduleKey !== "opinarios_rede" ? "opinarios_hotel" : moduleKey;
    const item = items.get(key);
    const isSiteOnly = document.documentElement.classList.contains("site-preview-only");
    document.getElementById("portalPageCategory").textContent = item?.category || "Portal SUEDS";
    const hotelTitle = key === "opinarios_hotel" && moduleKey !== key ? title : "";
    const pageTitle = document.getElementById("portalPageTitle");
    pageTitle.textContent = hotelTitle || item?.label || title || (isSiteOnly ? "Selecione um módulo" : "Vendas");
    pageTitle.hidden = item?.category === "Universidade SUEDS";
    document.querySelectorAll(".portal-sidebar [data-nav-key], .portal-icon-rail [data-nav-key]").forEach((element) => {
      const selected = element.dataset.navKey === key;
      element.classList.toggle("active", selected);
      if (selected) element.setAttribute("aria-current", "page");
      else element.removeAttribute("aria-current");
    });
    rail.querySelectorAll("[data-rail-category]").forEach((button) => {
      button.classList.toggle("active", button.dataset.railCategory === item?.category);
    });
    sidebar.querySelectorAll(".portal-nav-group").forEach((group) => {
      const active = group.dataset.navCategory === item?.category;
      group.classList.toggle("has-active-item", active);
      if (active) group.open = true;
    });
  }

  function init() {
    const profile = window.suedsPortalProfile;
    const isAdmin = profile?.roles?.includes("admin_geral");
    const identity = profile?.id || profile?.user_id || profile?.email;
    storageKey = identity ? `sueds:portal-navigation:v1:${identity}` : "";
    sidebar.querySelectorAll(".portal-standalone-row [data-nav-key]").forEach((element) => {
      const environment = element.dataset.environment;
      const allowed = element.hasAttribute("data-admin-only") ? isAdmin : Boolean(window.suedsPortalAccess?.[environment]);
      element.hidden = element.hidden || !allowed;
      element.parentElement.hidden = element.hidden;
      if (!element.hidden) {
        items.set(element.dataset.navKey, { element, label: element.textContent.trim(), category: "Comunicados" });
        if (!element.querySelector(".portal-group-icon")) {
          const itemIcon = document.createElement("span");
          itemIcon.className = "portal-group-icon";
          itemIcon.append(icon(element.dataset.navKey));
          element.prepend(itemIcon);
        }
      }
    });
    sidebar.querySelectorAll(".portal-nav-group").forEach((group) => {
      const summary = group.querySelector("summary");
      if (summary && !summary.querySelector(".portal-group-icon")) {
        const groupIcon = document.createElement("span");
        groupIcon.className = "portal-group-icon";
        groupIcon.append(icon(group.dataset.navCategory));
        summary.prepend(groupIcon);
      }
      group.querySelectorAll("[data-nav-key]").forEach((element) => {
        // The session can resolve before DOMContentLoaded applies auth visibility.
        // Check the session itself before creating any favorite or category.
        const environment = element.dataset.environment;
        const allowed = element.hasAttribute("data-admin-only") ? isAdmin :
          Boolean(window.suedsPortalAccess?.[environment]) || (environment === "site_novo_preview" && isAdmin);
        element.hidden = element.hidden || !allowed;
        element.parentElement.hidden = element.hidden;
        if (element.hidden) return;
        items.set(element.dataset.navKey, {
          element,
          label: element.childNodes[0].textContent.trim(),
          category: group.dataset.navCategory
        });
      });
      group.hidden = !Array.from(group.querySelectorAll(".portal-nav-row")).some((row) => !row.hidden);
    });
    try {
      const saved = JSON.parse(storageKey ? localStorage.getItem(storageKey) : "null");
      favorites = Array.isArray(saved?.favorites) ? [...new Set(saved.favorites.filter((key) => items.has(key)))] : [];
      collapsed = saved?.collapsed === true;
    } catch {}
    items.forEach((item, key) => item.element.parentElement.append(starButton(key)));
    renderFavorites();
    updateMenu();
  }

  toggle.addEventListener("click", () => {
    if (mobile.matches) drawerOpen = !drawerOpen;
    else { collapsed = !collapsed; savePreferences(); }
    updateMenu();
    if (drawerOpen) closeButton.focus();
  });
  closeButton.addEventListener("click", () => closeDrawer());
  backdrop.addEventListener("click", () => closeDrawer());
  mobile.addEventListener("change", () => {
    const hadFocus = sidebar.contains(document.activeElement);
    drawerOpen = false;
    updateMenu();
    if (sidebar.hidden && hadFocus) toggle.focus();
  });
  sidebar.addEventListener("click", (event) => {
    if (event.target.closest("[data-nav-key]")) closeDrawer();
  }, true);
  sidebar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite-key]");
    if (!button) return;
    const key = button.dataset.favoriteKey;
    const wasInFavorites = favoritesList.contains(button);
    favorites = favorites.includes(key) ? favorites.filter((item) => item !== key) : [...favorites, key];
    savePreferences();
    renderFavorites();
    const replacement = Array.from(sidebar.querySelectorAll("[data-favorite-key]")).find((candidate) =>
      candidate.dataset.favoriteKey === key && favoritesList.contains(candidate) === wasInFavorites);
    if (replacement) replacement.focus();
    else {
      const original = items.get(key).element;
      const group = original.closest("details");
      if (group) group.open = true;
      original.parentElement.querySelector("[data-favorite-key]").focus();
    }
  });
  sidebar.addEventListener("keydown", (event) => {
    if (!mobile.matches || !drawerOpen) return;
    if (event.key === "Escape") { event.preventDefault(); closeDrawer(); }
    if (event.key !== "Tab") return;
    const focusable = Array.from(sidebar.querySelectorAll("a[href],button,summary")).filter((element) =>
      !element.disabled && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  updateMenu();
  window.suedsPortalNavigation = { init, sync };
})();
