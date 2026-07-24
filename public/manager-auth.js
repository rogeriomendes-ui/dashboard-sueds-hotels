(function protectManagerPage() {
  const storageKey = "sueds_gestores_access_token";
  const fallbackUrl = "/dashboard-tv.html";
  const style = document.createElement("style");
  style.textContent = "html.manager-auth-pending body { visibility: hidden; }";
  document.head.appendChild(style);
  document.documentElement.classList.add("manager-auth-pending");

  function askToken(message) {
    const value = window.prompt(message);
    const token = String(value || "").trim();
    if (token) localStorage.setItem(storageKey, token);
    return token;
  }

  async function validate(token) {
    const response = await fetch("/api/dashboard/gestores?authOnly=1", {
      cache: "no-store",
      headers: { "x-dashboard-token": token }
    });
    return response.ok;
  }

  window.suedsManagerAuthReady = (async () => {
    let token = localStorage.getItem(storageKey) || "";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!token) token = askToken("Digite a senha de acesso dos gestores:");
      if (!token) {
        window.location.replace(fallbackUrl);
        throw new Error("Acesso de gestor não informado.");
      }

      if (await validate(token)) {
        document.documentElement.classList.remove("manager-auth-pending");
        return token;
      }

      localStorage.removeItem(storageKey);
      token = "";
      window.alert("Senha de gestor inválida.");
    }

    window.location.replace(fallbackUrl);
    throw new Error("Acesso de gestor não autorizado.");
  })().catch((error) => {
    if (window.location.pathname !== fallbackUrl) window.location.replace(fallbackUrl);
    throw error;
  });
})();
