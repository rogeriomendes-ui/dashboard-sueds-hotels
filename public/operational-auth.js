(function protectOperationalPage() {
  const managerStorageKey = "sueds_gestores_access_token";
  const operationalStorageKey = "sueds_operational_plaza_access_token";
  const leaderStorageKey = "sueds_operational_leader_name";
  const fallbackUrl = "/dashboard-tv.html";

  document.documentElement.classList.add("operational-auth-pending");

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  async function validateManager(token) {
    const response = await fetch("/api/dashboard/gestores?authOnly=1", {
      cache: "no-store",
      headers: { "x-dashboard-token": token }
    });
    return response.ok
      ? { role: "manager", username: "gestor", displayName: "Gestor", hotel: "*" }
      : null;
  }

  async function validateOperational(token) {
    const response = await fetch("/api/operacional/tv?authOnly=1", {
      cache: "no-store",
      headers: { "x-dashboard-token": token }
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    return payload.profile?.role === "plaza" ? payload.profile : null;
  }

  async function loginOperational(username, password) {
    const response = await fetch("/api/operacional/tv?action=login", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) return null;
    return response.json();
  }

  function applyProfile(profile) {
    window.suedsAccessProfile = profile;
    if (profile.role === "plaza") {
      localStorage.setItem(leaderStorageKey, profile.displayName || profile.username);
    }

    ready(() => {
      document.querySelectorAll("[data-manager-only]").forEach((element) => {
        element.hidden = profile.role !== "manager";
      });
      document.documentElement.classList.remove("operational-auth-pending");
    });
  }

  function showLogin() {
    return new Promise((resolve) => {
      ready(() => {
        const dialog = document.createElement("dialog");
        dialog.className = "operational-login";
        dialog.innerHTML = `
          <form method="dialog" class="operational-login-card">
            <header>
              <img src="/sueds-hotels-gold.png" alt="SUED'S Hotels">
              <div>
                <span>SUEDS Plaza</span>
                <h1>Acesso operacional</h1>
              </div>
            </header>

            <div class="operational-login-tabs" role="tablist" aria-label="Tipo de acesso">
              <button type="button" class="active" data-auth-mode="plaza" role="tab" aria-selected="true">Equipe Plaza</button>
              <button type="button" data-auth-mode="manager" role="tab" aria-selected="false">Gestor</button>
            </div>

            <label data-username-field>
              <span>Usuário</span>
              <input name="username" type="text" autocomplete="username" required>
            </label>

            <label>
              <span>Senha</span>
              <input name="password" type="password" autocomplete="current-password" required>
            </label>

            <p class="operational-login-message" role="alert"></p>

            <footer>
              <button type="button" class="operational-login-back" title="Voltar">Voltar</button>
              <button type="submit" class="operational-login-submit">Entrar</button>
            </footer>
          </form>
        `;
        document.body.appendChild(dialog);

        const form = dialog.querySelector("form");
        const usernameField = dialog.querySelector("[data-username-field]");
        const usernameInput = form.elements.username;
        const passwordInput = form.elements.password;
        const message = dialog.querySelector(".operational-login-message");
        const submit = dialog.querySelector(".operational-login-submit");
        let mode = "plaza";

        function setMode(nextMode) {
          mode = nextMode;
          dialog.querySelectorAll("[data-auth-mode]").forEach((button) => {
            const active = button.dataset.authMode === mode;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
          });
          usernameField.hidden = mode === "manager";
          usernameInput.required = mode !== "manager";
          message.textContent = "";
          window.setTimeout(() => (mode === "manager" ? passwordInput : usernameInput).focus(), 0);
        }

        dialog.querySelectorAll("[data-auth-mode]").forEach((button) => {
          button.addEventListener("click", () => setMode(button.dataset.authMode));
        });

        dialog.querySelector(".operational-login-back").addEventListener("click", () => {
          window.location.replace(fallbackUrl);
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          message.textContent = "";
          submit.disabled = true;
          submit.textContent = "Entrando...";

          try {
            const password = String(passwordInput.value || "");
            if (mode === "manager") {
              const profile = await validateManager(password);
              if (!profile) throw new Error("Senha de gestor inválida.");
              localStorage.setItem(managerStorageKey, password);
              resolve({ token: password, profile });
            } else {
              const payload = await loginOperational(usernameInput.value, password);
              if (!payload?.token || !payload?.profile) throw new Error("Usuário ou senha inválidos.");
              localStorage.setItem(operationalStorageKey, payload.token);
              resolve({ token: payload.token, profile: payload.profile });
            }
            dialog.close();
            dialog.remove();
          } catch (error) {
            message.textContent = error.message;
            passwordInput.select();
          } finally {
            submit.disabled = false;
            submit.textContent = "Entrar";
          }
        });

        dialog.addEventListener("cancel", (event) => event.preventDefault());
        dialog.showModal();
        setMode("plaza");
      });
    });
  }

  window.suedsManagerAuthReady = (async () => {
    const managerToken = localStorage.getItem(managerStorageKey) || "";
    if (managerToken) {
      const profile = await validateManager(managerToken);
      if (profile) {
        applyProfile(profile);
        return managerToken;
      }
      localStorage.removeItem(managerStorageKey);
    }

    const operationalToken = localStorage.getItem(operationalStorageKey) || "";
    if (operationalToken) {
      const profile = await validateOperational(operationalToken);
      if (profile) {
        applyProfile(profile);
        return operationalToken;
      }
      localStorage.removeItem(operationalStorageKey);
    }

    const access = await showLogin();
    applyProfile(access.profile);
    return access.token;
  })().catch((error) => {
    ready(() => document.documentElement.classList.remove("operational-auth-pending"));
    throw error;
  });
})();
