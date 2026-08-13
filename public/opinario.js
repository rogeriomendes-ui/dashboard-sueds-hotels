const RATING_LABELS = ["Excelente", "Muito bom", "Bom", "Regular"];

const FIELD_DEFINITIONS = {
  generalImpression: { group: "Impressão geral", label: "Como você avalia sua hospedagem?" },
  reservation: { group: "Reserva", label: "Como foi sua experiência para reservar?" },
  frontDesk: { group: "Avaliação dos serviços", label: "Recepção / Check-in / Check-out" },
  teamService: { group: "Avaliação dos serviços", label: "Atendimento da equipe" },
  roomComfort: { group: "Avaliação dos serviços", label: "Conforto do quarto" },
  roomCleaning: { group: "Avaliação dos serviços", label: "Limpeza do quarto" },
  apartmentComfort: { group: "Avaliação dos serviços", label: "Conforto do apartamento" },
  apartmentInitialCleaning: { group: "Avaliação dos serviços", label: "Limpeza inicial do apartamento" },
  apartmentEquipment: { group: "Avaliação dos serviços", label: "Equipamentos / utensílios do apartamento" },
  apartmentLocation: { group: "Avaliação dos serviços", label: "Localização do apartamento" },
  wifi: { group: "Avaliação dos serviços", label: "Qualidade do Wi-fi" },
  pool: { group: "Avaliação dos serviços", label: "Área de lazer / piscina" },
  beachClub: { group: "Avaliação dos serviços", label: "Atendimento da equipe do Beach Club" },
  foodBreakfast: { group: "Avaliação dos restaurantes", label: "Café da manhã" },
  foodAfternoonTea: { group: "Avaliação dos restaurantes", label: "Chá da tarde" },
  foodLunch: { group: "Avaliação dos restaurantes", label: "Almoço" },
  foodDinner: { group: "Avaliação dos restaurantes", label: "Jantar" }
};

const TRANSLATIONS = {
  "pt-BR": {
    title: "Sua experiência é o que mais importa para nós.",
    intro: "Queremos saber o que fizemos bem e onde podemos melhorar.",
    identityLabel: "Identificação obrigatória",
    questionsLabel: "Avaliações",
    guestName: "Nome",
    apartment: "Número do apartamento",
    comments: "Comentários, elogios e sugestões",
    submit: "Enviar avaliação",
    sending: "Enviando avaliação...",
    identityMissing: "Informe seu nome e o número do apartamento.",
    ratingsMissing: "Selecione uma opção em todos os itens.",
    requestFailed: "Não foi possível enviar a avaliação.",
    successTitle: "Avaliação enviada.",
    successMessage: "Obrigado por ajudar a SUEDS Hotels a cuidar melhor da sua hospedagem.",
    close: "Concluir",
    configuring: "Formulário em configuração.",
    inactive: "Este opinário ainda não está ativo para este hotel.",
    groups: {
      "Impressão geral": "Impressão geral",
      "Reserva": "Reserva",
      "Avaliação dos serviços": "Avaliação dos serviços",
      "Avaliação dos restaurantes": "Avaliação dos restaurantes"
    },
    ratings: { Excelente: "Excelente", "Muito bom": "Muito bom", Bom: "Bom", Regular: "Regular" },
    fields: Object.fromEntries(Object.entries(FIELD_DEFINITIONS).map(([key, field]) => [key, field.label]))
  },
  en: {
    title: "Your experience is what matters most to us.",
    intro: "We want to know what we did well and where we can improve.",
    identityLabel: "Required guest information",
    questionsLabel: "Ratings",
    guestName: "Name",
    apartment: "Room / apartment number",
    comments: "Comments, compliments and suggestions",
    submit: "Submit review",
    sending: "Submitting review...",
    identityMissing: "Please enter your name and room or apartment number.",
    ratingsMissing: "Please select an option for every item.",
    requestFailed: "We could not submit your review.",
    successTitle: "Review submitted.",
    successMessage: "Thank you for helping SUEDS Hotels take better care of your stay.",
    close: "Finish",
    configuring: "Form is being configured.",
    inactive: "This survey is not yet active for this hotel.",
    groups: {
      "Impressão geral": "Overall impression",
      "Reserva": "Reservation",
      "Avaliação dos serviços": "Service evaluation",
      "Avaliação dos restaurantes": "Restaurant evaluation"
    },
    ratings: { Excelente: "Excellent", "Muito bom": "Very good", Bom: "Good", Regular: "Fair" },
    fields: {
      generalImpression: "How would you rate your stay?",
      reservation: "How was your booking experience?",
      frontDesk: "Front desk / Check-in / Check-out",
      teamService: "Staff service",
      roomComfort: "Room comfort",
      roomCleaning: "Room cleanliness",
      apartmentComfort: "Apartment comfort",
      apartmentInitialCleaning: "Initial apartment cleanliness",
      apartmentEquipment: "Apartment equipment / utensils",
      apartmentLocation: "Apartment location",
      wifi: "Wi-Fi quality",
      pool: "Leisure area / pool",
      beachClub: "Beach Club staff service",
      foodBreakfast: "Breakfast",
      foodAfternoonTea: "Afternoon tea",
      foodLunch: "Lunch",
      foodDinner: "Dinner"
    }
  },
  es: {
    title: "Su experiencia es lo que más nos importa.",
    intro: "Queremos saber qué hicimos bien y dónde podemos mejorar.",
    identityLabel: "Identificación obligatoria",
    questionsLabel: "Evaluaciones",
    guestName: "Nombre",
    apartment: "Número de habitación / apartamento",
    comments: "Comentarios, elogios y sugerencias",
    submit: "Enviar evaluación",
    sending: "Enviando evaluación...",
    identityMissing: "Ingrese su nombre y número de habitación o apartamento.",
    ratingsMissing: "Seleccione una opción en todos los ítems.",
    requestFailed: "No fue posible enviar la evaluación.",
    successTitle: "Evaluación enviada.",
    successMessage: "Gracias por ayudar a SUEDS Hotels a cuidar mejor de su estadía.",
    close: "Finalizar",
    configuring: "Formulario en configuración.",
    inactive: "Esta encuesta aún no está activa para este hotel.",
    groups: {
      "Impressão geral": "Impresión general",
      "Reserva": "Reserva",
      "Avaliação dos serviços": "Evaluación de los servicios",
      "Avaliação dos restaurantes": "Evaluación de los restaurantes"
    },
    ratings: { Excelente: "Excelente", "Muito bom": "Muy bueno", Bom: "Bueno", Regular: "Regular" },
    fields: {
      generalImpression: "¿Cómo evalúa su estadía?",
      reservation: "¿Cómo fue su experiencia al reservar?",
      frontDesk: "Recepción / Check-in / Check-out",
      teamService: "Atención del equipo",
      roomComfort: "Comodidad de la habitación",
      roomCleaning: "Limpieza de la habitación",
      apartmentComfort: "Comodidad del apartamento",
      apartmentInitialCleaning: "Limpieza inicial del apartamento",
      apartmentEquipment: "Equipos / utensilios del apartamento",
      apartmentLocation: "Ubicación del apartamento",
      wifi: "Calidad del Wi-Fi",
      pool: "Área de ocio / piscina",
      beachClub: "Atención del equipo del Beach Club",
      foodBreakfast: "Desayuno",
      foodAfternoonTea: "Merienda",
      foodLunch: "Almuerzo",
      foodDinner: "Cena"
    }
  }
};

const HOTEL_BRANDS = {
  "sueds-cabralia": {
    brand: "CABRÁLIA",
    name: "SUEDS CABRÁLIA",
    logo: "logo-opinario-cabralia.png",
    formVersion: "20260729"
  },
  "sueds-segundo-sol": {
    brand: "SEGUNDO SOL",
    name: "SUEDS SEGUNDO SOL",
    logo: "logo-opinario-segundo-sol.png",
    formVersion: "20260729"
  },
  "sueds-plaza": {
    brand: "PLAZA",
    name: "SUEDS PLAZA",
    logo: "logo-opinario-plaza.png",
    formVersion: "20260729"
  },
  "sueds-premium": {
    brand: "PREMIUM",
    name: "SUEDS PREMIUM",
    logo: "logo-opinario-premium.png",
    formVersion: "20260729"
  },
  "sueds-trancoso": {
    brand: "TRANCOSO",
    name: "SUEDS TRANCOSO",
    logo: "logo-opinario-trancoso.png",
    formVersion: "20260729"
  },
  "casas-sueds-arraial": {
    brand: "CASAS SUEDS",
    name: "CASAS SUEDS ARRAIAL",
    logo: "logo-opinario-casas-arraial.png",
    formVersion: "20260729"
  }
};

const HOTEL_CONFIG = {
  "sueds-cabralia": {
    brand: "CABRÁLIA",
    name: "SUEDS CABRALIA",
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
      "beachClub",
      "foodBreakfast",
      "foodLunch",
      "foodDinner"
    ]
  },
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
      "foodBreakfast",
      "foodAfternoonTea"
    ]
  },
  "casas-sueds-arraial": {
    brand: "CASAS SUEDS",
    name: "CASAS SUEDS ARRAIAL",
    fields: [
      "generalImpression",
      "reservation",
      "teamService",
      "apartmentComfort",
      "apartmentInitialCleaning",
      "apartmentEquipment",
      "wifi",
      "apartmentLocation"
    ]
  }
};

function byId(id) {
  return document.getElementById(id);
}

function slugFromParams() {
  const params = new URLSearchParams(window.location.search);
  return params.get("hotel") || "sueds-plaza";
}

function normalizeLanguage(value) {
  const language = String(value || "").toLowerCase();
  if (language.startsWith("en")) return "en";
  if (language.startsWith("es")) return "es";
  return "pt-BR";
}

function formMeta() {
  const params = new URLSearchParams(window.location.search);
  const hotelSlug = slugFromParams();
  return {
    hotelSlug,
    formVersion: params.get("form_version") || HOTEL_BRANDS[hotelSlug]?.formVersion || "20260719",
    lang: normalizeLanguage(params.get("lang"))
  };
}

function groupedFields(fields, translation) {
  return fields.reduce((groups, key) => {
    const field = FIELD_DEFINITIONS[key];
    if (!field) return groups;
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push({ key, group: field.group, label: translation.fields[key] || field.label });
    return groups;
  }, new Map());
}

function ratingInput(fieldKey, value, label, index) {
  const id = `${fieldKey}-rating-${index}`;
  return `
    <label>
      <input type="radio" id="${id}" name="${fieldKey}" value="${value}" required>
      <span>${label}</span>
    </label>
  `;
}

function renderQuestions(config, lang, preservedRatings = {}) {
  const translation = TRANSLATIONS[lang];
  const groups = groupedFields(config.fields, translation);
  byId("questions").innerHTML = [...groups.entries()].map(([group, fields]) => `
    <section class="question-group">
      <h2>${translation.groups[group] || group}</h2>
      ${fields.map((field) => `
        <fieldset class="rating-row">
          <legend>${field.label}</legend>
          <div class="rating-options">
            ${RATING_LABELS.map((value, index) => ratingInput(field.key, value, translation.ratings[value], index)).join("")}
          </div>
        </fieldset>
      `).join("")}
    </section>
  `).join("");
  Object.entries(preservedRatings).forEach(([key, value]) => {
    [...document.querySelectorAll(`input[name="${key}"]`)].find((input) => input.value === value)?.click();
  });
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

function applyTranslations(config, lang, preserveAnswers = true) {
  const translation = TRANSLATIONS[lang];
  const preservedRatings = preserveAnswers && config ? selectedRatings(config) : {};
  document.documentElement.lang = lang;
  byId("formLang").value = lang;
  byId("headerTitle").textContent = translation.title;
  byId("headerIntro").textContent = translation.intro;
  byId("guestStrip").setAttribute("aria-label", translation.identityLabel);
  byId("questions").setAttribute("aria-label", translation.questionsLabel);
  byId("guestNameLabel").innerHTML = `${translation.guestName} <b aria-hidden="true">*</b>`;
  byId("apartmentLabel").innerHTML = `${translation.apartment} <b aria-hidden="true">*</b>`;
  byId("commentsLabel").textContent = translation.comments;
  byId("submitButton").textContent = translation.submit;
  byId("successTitle").textContent = translation.successTitle;
  byId("successMessage").textContent = translation.successMessage;
  byId("successCloseButton").textContent = translation.close;
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === lang));
  });
  if (config) renderQuestions(config, lang, preservedRatings);
}

function selectLanguage(config, lang) {
  const normalized = normalizeLanguage(lang);
  const url = new URL(window.location.href);
  url.searchParams.set("lang", normalized);
  window.history.replaceState({}, "", url);
  applyTranslations(config, normalized);
  setMessage("");
}

function openConfirmation() {
  const panel = byId("successPanel");
  panel.hidden = false;
  document.body.classList.add("modal-open");
  panel.focus();
}

function closeConfirmation() {
  byId("successPanel").hidden = true;
  document.body.classList.remove("modal-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function submitOpinion(event) {
  event.preventDefault();
  const meta = formMeta();
  const config = HOTEL_CONFIG[meta.hotelSlug];
  const translation = TRANSLATIONS[meta.lang];
  const guestName = byId("guestName").value.trim();
  const apartment = byId("apartment").value.trim();
  if (!guestName || !apartment) {
    setMessage(translation.identityMissing, true);
    (!guestName ? byId("guestName") : byId("apartment")).focus();
    return;
  }
  const missing = firstMissingRating(config);
  if (missing) {
    setMessage(translation.ratingsMissing, true);
    document.querySelector(`input[name="${missing}"]`)?.focus();
    return;
  }

  const button = byId("submitButton");
  button.disabled = true;
  setMessage(translation.sending);

  try {
    const response = await fetch("/api/operacional/opinarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...meta,
        hotel: config.name,
        guestName,
        apartment,
        comments: byId("comments").value,
        ratings: selectedRatings(config)
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(meta.lang === "pt-BR" && payload.message ? payload.message : translation.requestFailed);
    }

    byId("opinionForm").hidden = true;
    openConfirmation();
  } catch (error) {
    setMessage(error.message, true);
    button.disabled = false;
  }
}

function init() {
  const meta = formMeta();
  const branding = HOTEL_BRANDS[meta.hotelSlug];
  const config = HOTEL_CONFIG[meta.hotelSlug];
  const logo = byId("hotelLogo");
  byId("successCloseButton").addEventListener("click", closeConfirmation);
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => selectLanguage(config, button.dataset.language));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !byId("successPanel").hidden) closeConfirmation();
  });
  if (branding) {
    logo.src = branding.logo;
    logo.alt = branding.name;
    document.title = `SUEDS Hotels | Opiniário ${branding.brand}`;
  }
  if (!config) {
    applyTranslations(null, meta.lang, false);
    byId("opinionForm").hidden = true;
    byId("successTitle").textContent = TRANSLATIONS[meta.lang].configuring;
    byId("successMessage").textContent = TRANSLATIONS[meta.lang].inactive;
    openConfirmation();
    return;
  }
  byId("hotelSlug").value = meta.hotelSlug;
  byId("formVersion").value = meta.formVersion;
  document.title = `SUEDS Hotels | Opiniário ${config.brand}`;
  applyTranslations(config, meta.lang, false);
  byId("opinionForm").addEventListener("submit", submitOpinion);
}

init();
