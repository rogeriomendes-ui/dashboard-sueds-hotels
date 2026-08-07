(function setupPortalLogin() {
  const form = document.getElementById("portalLoginForm");
  const feedback = document.getElementById("loginFeedback");
  const button = document.getElementById("loginButton");
  const requestedNext = new URLSearchParams(window.location.search).get("next") || "/gestores";
  const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/gestores";

  function destination(payload) {
    if (safeNext.startsWith("/gestores") && !payload.profile?.roles?.includes("admin_geral")) return "/inspecoes";
    return safeNext;
  }

  fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => response.ok ? response.json() : null)
    .then((payload) => { if (payload) window.location.replace(destination(payload)); })
    .catch(() => {});

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
