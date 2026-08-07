(function setupUserAdministration() {
  const state = { catalog: null, query: "", editing: null };
  const byId = (id) => document.getElementById(id);
  const list = byId("usersList");
  const dialog = byId("userDialog");
  const form = byId("userForm");
  const message = byId("pageMessage");
  const formMessage = byId("formMessage");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function initials(name) {
    return String(name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function tags(values, type = "") {
    return values.length ? values.map((value) => `<span class="tag ${type}">${escapeHtml(value)}</span>`).join("") : '<span class="tag">Não definido</span>';
  }

  function renderUsers() {
    const query = state.query.toLocaleLowerCase("pt-BR");
    const users = state.catalog.users.filter((user) => [user.name, user.email, ...user.roleNames, ...user.hotelNames, ...user.environmentNames].join(" ").toLocaleLowerCase("pt-BR").includes(query));
    byId("userCount").textContent = `${users.length} usuário${users.length === 1 ? "" : "s"}`;
    list.innerHTML = users.length ? users.map((user) => `
      <article class="user-row ${user.status === "inactive" ? "inactive" : ""}">
        <div class="user-identity"><span class="avatar">${escapeHtml(initials(user.name))}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email || "E-mail não disponível")}</small></div></div>
        <div class="tag-list">${tags(user.roleNames, "role")}</div>
        <div class="tag-list">${tags(user.environmentNames)}</div>
        <button class="edit-button" type="button" data-edit-user="${escapeHtml(user.id)}" aria-label="Editar ${escapeHtml(user.name)}">✎</button>
      </article>
    `).join("") : '<div class="empty-state">Nenhum usuário encontrado.</div>';
  }

  function checkCard(item, group, checked) {
    return `<label class="check-card"><input type="checkbox" name="${group}" value="${escapeHtml(item.id)}" ${checked ? "checked" : ""}><span>${escapeHtml(item.name)}${item.description ? `<small>${escapeHtml(item.description)}</small>` : ""}</span></label>`;
  }

  function selected(name) {
    return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  function openEditor(user = null) {
    state.editing = user;
    byId("dialogEyebrow").textContent = user ? "Controle de acesso" : "Novo acesso";
    byId("dialogTitle").textContent = user ? "Editar usuário" : "Convidar usuário";
    byId("userId").value = user?.id || "";
    byId("userName").value = user?.name || "";
    byId("userEmail").value = user?.email || "";
    byId("userEmail").disabled = Boolean(user);
    byId("userStatus").value = user?.status || "active";
    byId("statusField").hidden = !user;
    byId("rolesOptions").innerHTML = state.catalog.roles.map((role) => checkCard(role, "roles", user?.roleIds.includes(Number(role.id)))).join("");
    byId("environmentOptions").innerHTML = state.catalog.environments.map((environment) => checkCard(environment, "environments", user?.environmentIds.includes(Number(environment.id)))).join("");
    byId("hotelOptions").innerHTML = state.catalog.hotels.map((hotel) => checkCard(hotel, "hotels", user?.hotelIds.includes(hotel.id))).join("");
    byId("saveUser").textContent = user ? "Salvar acessos" : "Enviar convite";
    formMessage.textContent = "";
    formMessage.className = "form-message";
    dialog.showModal();
  }

  function suggestEnvironment(roleSlug) {
    const suggestions = { vendedor: "ranking_vendedores", lider_operacional: "opinarios_hotel", gestor_unidade: "inspecoes", inspetor: "inspecoes", responsavel_correcao: "inspecoes" };
    const environmentSlug = suggestions[roleSlug];
    if (!environmentSlug) return;
    const environment = state.catalog.environments.find((item) => item.slug === environmentSlug);
    const input = environment && form.querySelector(`input[name="environments"][value="${environment.id}"]`);
    if (input) input.checked = true;
  }

  async function loadCatalog() {
    message.textContent = "";
    const response = await fetch("/api/portal/users", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 403) {
      window.location.replace("/gestores");
      return;
    }
    if (!response.ok) throw new Error(payload.message || "Não foi possível carregar os usuários.");
    state.catalog = payload;
    renderUsers();
  }

  form.addEventListener("change", (event) => {
    if (event.target.name !== "roles" || !event.target.checked) return;
    const role = state.catalog.roles.find((item) => String(item.id) === event.target.value);
    if (!role) return;
    if (role.slug === "admin_geral") form.querySelectorAll('input[name="environments"]').forEach((input) => { input.checked = true; });
    suggestEnvironment(role.slug);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";
    const payload = {
      id: byId("userId").value,
      name: byId("userName").value.trim(),
      email: byId("userEmail").value.trim(),
      status: byId("userStatus").value,
      roleIds: selected("roles").map(Number),
      hotelIds: selected("hotels"),
      environmentIds: selected("environments").map(Number)
    };
    if (!payload.roleIds.length || !payload.environmentIds.length) {
      formMessage.textContent = "Selecione pelo menos um perfil e um ambiente.";
      formMessage.className = "form-message error";
      return;
    }
    const opinionHotel = state.catalog.environments.find((item) => item.slug === "opinarios_hotel");
    if (opinionHotel && payload.environmentIds.includes(Number(opinionHotel.id)) && !payload.hotelIds.length) {
      formMessage.textContent = "Selecione ao menos um hotel para o acesso aos Opinários por hotel.";
      formMessage.className = "form-message error";
      return;
    }
    const button = byId("saveUser");
    button.disabled = true;
    button.textContent = state.editing ? "Salvando…" : "Enviando…";
    try {
      const response = await fetch("/api/portal/users", {
        method: state.editing ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível salvar o usuário.");
      dialog.close();
      message.textContent = result.message;
      message.className = "page-message success";
      await loadCatalog();
    } catch (error) {
      formMessage.textContent = error.message;
      formMessage.className = "form-message error";
    } finally {
      button.disabled = false;
      button.textContent = state.editing ? "Salvar acessos" : "Enviar convite";
    }
  });

  byId("inviteButton").addEventListener("click", () => openEditor());
  byId("closeDialog").addEventListener("click", () => dialog.close());
  byId("cancelDialog").addEventListener("click", () => dialog.close());
  byId("userSearch").addEventListener("input", (event) => { state.query = event.target.value; renderUsers(); });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-user]");
    if (!button) return;
    openEditor(state.catalog.users.find((user) => user.id === button.dataset.editUser));
  });

  Promise.resolve(window.suedsManagerAuthReady).then(() => {
    if (!window.suedsPortalProfile?.roles?.includes("admin_geral")) {
      window.location.replace(window.suedsPortalAccess?.landingPage || "/gestores");
      return;
    }
    return loadCatalog();
  }).catch((error) => {
    message.textContent = error.message;
    message.className = "page-message error";
    byId("userCount").textContent = "Falha ao carregar";
  });
})();
