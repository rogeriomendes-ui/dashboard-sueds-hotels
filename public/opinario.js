const RATING_LABELS = ["Excelente", "Muito bom", "Bom", "Regular"];

const FIELD_DEFINITIONS = {
  generalImpression: { group: "Impressão geral", label: "Como você avalia sua hospedagem?" },
  reservation: { group: "Reserva", label: "Como foi sua experiência para reservar?" },
  frontDesk: { group: "Avaliação dos serviços", label: "Recepção / Check-in / Check-out" },
  teamService: { group: "Avaliação dos serviços", label: "Atendimento da equipe" },
  roomComfort: { group: "Avaliação dos serviços", label: "Conforto do quarto" },
  roomCleaning: { group: "Avaliação dos serviços", label: "Limpeza do quarto" },
  wifi: { group: "Avaliação dos serviços", label: "Qualidade do Wi-fi" },
  pool: { group: "Avaliação dos serviços", label: "Área de lazer / piscina" },
  beachClub: { group: "Avaliação dos serviços", label: "Atendimento da equipe do Beach Club" },
  foodBreakfast: { group: "Avaliação dos restaurantes", label: "Café da manhã" },
  foodLunch: { group: "Avaliação dos restaurantes", label: "Almoço" },
  foodDinner: { group: "Avaliação dos restaurantes", label: "Jantar" }
};

const HOTEL_CONFIG = {
  "sueds-plaza": {
    brand: "PLAZA",
    name: "SUEDS PLAZA",
    fields: [
      "generalImpression",
      "reservation",
      "frontDesk",
      "teamService",
      "roomComfort",
      "roomCleaning",
      "wifi",
      "pool",
      "beachClub",
      "foodBreakfast",
      "foodLunch",
      "foodDinner"
    ]
  },
  "sueds-trancoso": {
    brand: "TRANCOSO",
    name: "SUEDS TRANCOSO",
    fields: [
      "generalImpression",
      "reservation",
      "frontDesk",
      "teamService",
      "roomComfort",
      "roomCleaning",
      "wifi",
      "pool",
      "foodBreakfast"
    ]
  },
  "casas-sueds-arraial": {
    brand: "CASAS",
    name: "CASAS SUEDS ARRAIAL",
    fields: [
      "generalImpression",
      "reservation",
      "frontDesk",
      "teamService",
      "roomComfort",
      "roomCleaning",
      "wifi",
      "foodBreakfast"
    ]
  },
  "sueds-cabralia": {
    brand: "CABRÁLIA",
    name: "SUEDS CABRÁLIA",
    fields: [
      "generalImpression",
      "reservation",
      "frontDesk",
      "teamService",
      "roomComfort",
      "roomCleaning",
      "wifi",
      "pool",
      "foodBreakfast",
      "foodLunch",
      "foodDinner"
    ]
  },
  "sueds-segundo-sol": {
    brand: "SEGUNDO SOL",
    name: "SUEDS SEGUNDO SOL",
    fields: [
      "generalImpression",
      "reservation",
      "frontDesk",
      "teamService",
      "roomComfort",
      "roomCleaning",
      "wifi",
      "pool",
      "foodBreakfast",
      "foodLunch",
      "foodDinner"
    ]
  },
  "sueds-premium": {
    brand: "PREMIUM",
    name: "SUEDS PREMIUM",
    fields: [
      "generalImpression",
      "reservation",
      "frontDesk",
      "teamService",
      "roomComfort",
      "roomCleaning",
      "wifi",
      "pool",
      "foodBreakfast",
      "foodLunch",
      "foodDinner"
    ]
  }
};

function byId(id) {
  return document.getElementById(id);
}

function slugFromParams() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("hotel") || "sueds-plaza";
  return HOTEL_CONFIG[requested] ? requested : "sueds-plaza";
}

function formMeta() {
  const params = new URLSearchParams(window.location.search);
  return {
    hotelSlug: slugFromParams(),
    formVersion: params.get("form_version") || "20260719",
    lang: params.get("lang") || "pt-BR"
  };
}

function groupedFields(fields) {
  return fields.reduce((groups, key) => {
    const field = FIELD_DEFINITIONS[key];
    if (!field) return groups;
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push({ key, ...field });
    return groups;
  }, new Map());
}

function ratingInput(fieldKey, label) {
  const id = `${fieldKey}-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return `
    <label>
      <input type="radio" id="${id}" name="${fieldKey}" value="${label}" required>
      <span>${label}</span>
    </label>
  `;
}

function renderQuestions(config) {
  const groups = groupedFields(config.fields);
  byId("questions").innerHTML = [...groups.entries()].map(([group, fields]) => `
    <section class="question-group">
      <h2>${group}</h2>
      ${fields.map((field) => `
        <fieldset class="rating-row">
          <legend>${field.label}</legend>
          <div class="rating-options">
            ${RATING_LABELS.map((label) => ratingInput(field.key, label)).join("")}
          </div>
        </fieldset>
      `).join("")}
    </section>
  `).join("");
}

function selectedRatings(config) {
  return Object.fromEntries(config.fields.map((key) => {
    const checked = document.querySelector(`input[name="${key}"]:checked`);
    return [key, checked ? checked.value : ""];
  }));
}

function firstMissingRating(config) {
  return config.fields.find((key) => !document.querySelector(`input[name="${key}"]:checked`));
}

function setMessage(message, isError = false) {
  const target = byId("formMessage");
  target.textContent = message;
  target.classList.toggle("error", isError);
}

async function submitOpinion(event) {
  event.preventDefault();
  const meta = formMeta();
  const config = HOTEL_CONFIG[meta.hotelSlug];
  const missing = firstMissingRating(config);
  if (missing) {
    setMessage("Selecione uma opção em todos os itens.", true);
    document.querySelector(`input[name="${missing}"]`)?.focus();
    return;
  }

  const button = byId("submitButton");
  button.disabled = true;
  setMessage("Enviando avaliação...");

  try {
    const response = await fetch("/api/operacional/opinarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...meta,
        hotel: config.name,
        guestName: byId("guestName").value,
        apartment: byId("apartment").value,
        comments: byId("comments").value,
        contactConsent: byId("contactConsent").checked,
        ratings: selectedRatings(config)
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Não foi possível enviar a avaliação.");
    }

    byId("opinionForm").hidden = true;
    byId("successPanel").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage(error.message, true);
    button.disabled = false;
  }
}

function init() {
  const meta = formMeta();
  const config = HOTEL_CONFIG[meta.hotelSlug];
  byId("hotelSlug").value = meta.hotelSlug;
  byId("formVersion").value = meta.formVersion;
  byId("formLang").value = meta.lang;
  byId("hotelBrand").textContent = config.brand;
  document.title = `SUEDS Hotels | Opiniário ${config.brand}`;
  renderQuestions(config);
  byId("opinionForm").addEventListener("submit", submitOpinion);
}

init();
