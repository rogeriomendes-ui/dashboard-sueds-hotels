(function setupPortalLogin() {
  const form = document.getElementById("portalLoginForm");
  const feedback = document.getElementById("loginFeedback");
  const button = document.getElementById("loginButton");
  const recoveryForm = document.getElementById("recoveryForm");
  const recoveryFeedback = document.getElementById("recoveryFeedback");
  const recoveryButton = document.getElementById("recoveryButton");
  const setupForm = document.getElementById("passwordSetupForm");
  const passwordTitle = document.getElementById("passwordTitle");
  const passwordIntro = document.getElementById("passwordIntro");
  const recoveryExpiryNotice = document.getElementById("recoveryExpiryNotice");
  const passwordFeedback = document.getElementById("passwordFeedback");
  const passwordButton = document.getElementById("passwordButton");
  const otpFields = document.getElementById("otpFields");
  const openFirstAccess = document.getElementById("openFirstAccess");
  const backToLogin = document.getElementById("backToLogin");
  const backFromRecovery = document.getElementById("backFromRecovery");
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const invitationToken = hash.get("access_token") || "";
  const requestedNext = new URLSearchParams(window.location.search).get("next") || "/gestores";
  const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/gestores";
  let recoveryRequested = false;

  function destination(payload) {
    if (safeNext.startsWith("/gestores") && !payload.access?.gestores) return payload.access?.landingPage || "/login?acesso=nao-configurado";
    return safeNext;
  }

  function showPasswordSetup(usingLink = false) {
    form.hidden = true;
    recoveryForm.hidden = true;
    setupForm.hidden = false;
    otpFields.hidden = usingLink;
  }

  function showLogin() {
    setupForm.hidden = true;
    recoveryForm.hidden = true;
    form.hidden = false;
    passwordFeedback.textContent = "";
    history.replaceState(null, "", "/login");
  }

  function showRecovery() {
    form.hidden = true;
    setupForm.hidden = true;
    recoveryForm.hidden = false;
    document.getElementById("recoveryEmail").value = document.getElementById("email").value;
  }

  document.querySelectorAll("[data-password-target]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = document.getElementById(toggle.dataset.passwordTarget);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.textContent = showing ? "👁" : "🙈";
      toggle.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
      toggle.title = showing ? "Mostrar senha" : "Ocultar senha";
    });
  });

  openFirstAccess.addEventListener("click", () => {
    recoveryRequested = false;
    recoveryExpiryNotice.hidden = true;
    passwordTitle.textContent = "Crie sua senha";
    passwordIntro.textContent = "Informe o código recebido por e-mail e escolha uma senha com pelo menos 8 caracteres.";
    showPasswordSetup(false);
  });
  backToLogin.addEventListener("click", showLogin);
  backFromRecovery.addEventListener("click", showLogin);

  if (invitationToken) {
    recoveryExpiryNotice.hidden = true;
    if (hash.get("type") === "recovery") passwordTitle.textContent = "Redefina sua senha";
    passwordIntro.textContent = "Escolha uma senha com pelo menos 8 caracteres.";
    showPasswordSetup(true);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } else if (new URLSearchParams(window.location.search).has("recuperar")) {
    showRecovery();
  } else {
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => { if (payload) window.location.replace(destination(payload)); })
      .catch(() => {});
  }

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("recoveryEmail").value.trim();
    recoveryFeedback.textContent = "";
    recoveryButton.disabled = true;
    recoveryButton.textContent = "Enviando...";
    const response = await fetch("/api/auth/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    }).catch(() => null);
    recoveryButton.disabled = false;
    recoveryButton.textContent = "Enviar instruções";
    if (!response?.ok) {
      recoveryFeedback.textContent = response?.status === 429
        ? "Muitas solicitações. Aguarde alguns minutos e tente novamente."
        : "Não foi possível solicitar a recuperação agora. Tente novamente.";
      return;
    }
    recoveryRequested = true;
    recoveryExpiryNotice.hidden = false;
    document.getElementById("firstAccessEmail").value = email;
    passwordTitle.textContent = "Redefina sua senha";
    passwordIntro.textContent = "Se o e-mail estiver cadastrado, você receberá um link ou código. Confira também Spam e Lixo eletrônico. Informe o código e escolha uma nova senha.";
    showPasswordSetup(false);
  });

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
    const endpoint = invitationToken ? "/api/auth/password" : "/api/auth/first-access";
    const requestBody = invitationToken
      ? { accessToken: invitationToken, password }
      : {
          email: document.getElementById("firstAccessEmail").value.trim(),
          token: document.getElementById("firstAccessCode").value.trim(),
          type: recoveryRequested ? "recovery" : "auto",
          password
        };
    if (!invitationToken && (!requestBody.email || !requestBody.token)) {
      passwordFeedback.textContent = "Informe o e-mail e o código recebido.";
      passwordButton.disabled = false;
      passwordButton.textContent = "Salvar senha";
      return;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    }).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => ({}));
      if (invitationToken) {
        passwordFeedback.textContent = "Este link expirou ou já foi utilizado. Use o código recebido no e-mail.";
      } else if (response?.status === 429 || payload?.error === "over_request_rate_limit") {
        passwordFeedback.textContent = "Muitas tentativas seguidas. Aguarde alguns minutos e solicite um novo código.";
      } else {
        passwordFeedback.textContent = "Código inválido ou expirado. Solicite um novo e-mail.";
      }
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
