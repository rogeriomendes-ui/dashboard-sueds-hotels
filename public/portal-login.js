(function setupPortalLogin() {
  const form = document.getElementById("portalLoginForm");
  const feedback = document.getElementById("loginFeedback");
  const button = document.getElementById("loginButton");
  const setupForm = document.getElementById("passwordSetupForm");
  const passwordFeedback = document.getElementById("passwordFeedback");
  const passwordButton = document.getElementById("passwordButton");
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const invitationToken = hash.get("access_token") || "";
  const requestedNext = new URLSearchParams(window.location.search).get("next") || "/gestores";
  const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/gestores";

  function destination(payload) {
    if (safeNext.startsWith("/gestores") && !payload.profile?.roles?.includes("admin_geral")) return "/inspecoes";
    return safeNext;
  }

  if (invitationToken) {
    form.hidden = true;
    setupForm.hidden = false;
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } else {
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => { if (payload) window.location.replace(destination(payload)); })
      .catch(() => {});
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("newPassword").value;
    const confirmation = document.getElementById("confirmPassword").value;
    passwordFeedback.textContent = "";
    if (password.length < 8) {
      passwordFeedback.textContent = "A senha precisa ter pelo menos 8 caracteres.";
      return;
    }
    if (password !== confirmation) {
      passwordFeedback.textContent = "As senhas não são iguais.";
      return;
    }
    passwordButton.disabled = true;
    passwordButton.textContent = "Salvando...";
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: invitationToken, password })
    }).catch(() => null);
    if (!response?.ok) {
      passwordFeedback.textContent = "Este link expirou ou já foi utilizado. Solicite um novo e-mail.";
      passwordButton.disabled = false;
      passwordButton.textContent = "Salvar senha";
      return;
    }
    window.location.replace("/login?senha=criada");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    feedback.textContent = "";
    button.disabled = true;
    button.textContent = "Entrando...";
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
      })
    }).catch(() => null);
    if (!response?.ok) {
      feedback.textContent = response?.status === 401 ? "E-mail ou senha inválidos." : "Não foi possível entrar agora. Tente novamente.";
      button.disabled = false;
      button.textContent = "Entrar no Portal SUEDS";
      return;
    }
    const payload = await response.json();
    window.location.replace(destination(payload));
  });
})();
