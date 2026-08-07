(function protectManagerPage() {
  const style = document.createElement("style");
  style.textContent = "html.manager-auth-pending body { visibility: hidden; }";
  document.head.appendChild(style);
  document.documentElement.classList.add("manager-auth-pending");

  function whenDomReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  window.suedsManagerAuthReady = fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin"
  }).then(async (response) => {
    if (response.status === 401) {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      throw new Error("Login necessário.");
    }
    const payload = await response.json();
    const requiredEnvironment = document.documentElement.dataset.requiredEnvironment || "painel_gestores";
    if (!response.ok || !payload.access?.[requiredEnvironment]) {
      window.location.replace(payload.access?.landingPage || "/login?acesso=nao-configurado");
      throw new Error("Perfil sem acesso a este ambiente.");
    }
    window.suedsPortalProfile = payload.profile;
    window.suedsPortalAccess = payload.access;
    whenDomReady(() => {
      document.querySelectorAll("[data-environment]").forEach((element) => {
        element.hidden = !payload.access?.[element.dataset.environment];
      });
      document.querySelectorAll("[data-admin-only]").forEach((element) => {
        element.hidden = !payload.profile?.roles?.includes("admin_geral");
      });
      document.documentElement.classList.remove("manager-auth-pending");
    });
    return payload.profile;
  }).catch((error) => {
    if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/inspecoes")) {
      console.error(error);
    }
    throw error;
  });
})();
