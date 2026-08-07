(function protectManagerPage() {
  const style = document.createElement("style");
  style.textContent = "html.manager-auth-pending body { visibility: hidden; }";
  document.head.appendChild(style);
  document.documentElement.classList.add("manager-auth-pending");

  window.suedsManagerAuthReady = fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin"
  }).then(async (response) => {
    if (response.status === 401) {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      throw new Error("Login necessário.");
    }
    const payload = await response.json();
    if (!response.ok || !payload.access?.gestores) {
      window.location.replace("/inspecoes");
      throw new Error("Perfil sem acesso ao Painel de Gestores.");
    }
    window.suedsPortalProfile = payload.profile;
    document.documentElement.classList.remove("manager-auth-pending");
    return payload.profile;
  }).catch((error) => {
    if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/inspecoes")) {
      console.error(error);
    }
    throw error;
  });
})();
