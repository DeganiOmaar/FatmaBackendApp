/**
 * Groq OpenAI-compatible Chat API — keys: https://console.groq.com/keys
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function parseJsonFromModelText(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.projectTitle
 * @param {string} opts.projectDescription
 * @param {number|null|undefined} opts.clientBudget
 * @param {string} [opts.freelancerName]
 * @param {string[]} [opts.freelancerSkills]
 * @param {string} [opts.freelancerBio]
 */
async function generateProposalDraft(opts) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error("GROQ_API_KEY manquant");
    err.code = "GROQ_MISSING_KEY";
    throw err;
  }

  const model =
    process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

  const {
    projectTitle,
    projectDescription,
    clientBudget,
    freelancerName,
    freelancerSkills,
    freelancerBio,
  } = opts;

  const budgetLine =
    clientBudget != null && Number.isFinite(Number(clientBudget))
      ? String(clientBudget)
      : "non précisé";

  const userPrompt = `Tu es un freelancer sur une plateforme de missions. Rédige une proposition convaincante en français pour le projet ci-dessous.

### Mission (publiée par le client)
**Titre:** ${projectTitle}
**Description:** ${projectDescription}
**Budget affiché:** ${budgetLine}

### Ton profil (freelancer)
**Nom:** ${freelancerName || "—"}
**Compétences:** ${Array.isArray(freelancerSkills) && freelancerSkills.length ? freelancerSkills.join(", ") : "non précisées"}
**Bio:** ${freelancerBio || "non précisée"}

Réponds UNIQUEMENT avec un objet JSON UTF-8 valide, sans markdown ni texte autour, exactement sous cette forme:
{"coverLetter":"lettre professionnelle claire, 150 à 350 mots","deliveryDays":entier entre 1 et 90,"priceSuggestion":entier ou null si tu utilises le budget client tel quel}`;

  if (typeof fetch !== "function") {
    const err = new Error(
      "fetch indisponible — utilise Node.js 18+ ou configure un polyfill"
    );
    err.code = "FETCH_UNAVAILABLE";
    throw err;
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Tu réponds uniquement par un objet JSON valide, sans blocs de code ni commentaires.",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.65,
      max_tokens: 1200,
    }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    const err = new Error(`Groq HTTP ${res.status}: ${rawBody.slice(0, 500)}`);
    err.code = "GROQ_HTTP_ERROR";
    err.status = res.status;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    const err = new Error("Réponse Groq illisible");
    err.code = "GROQ_PARSE_ERROR";
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  const parsed = parseJsonFromModelText(content);

  if (!parsed || typeof parsed.coverLetter !== "string") {
    const err = new Error("Format JSON du modèle invalide");
    err.code = "GROQ_BAD_SHAPE";
    throw err;
  }

  let deliveryDays = parseInt(String(parsed.deliveryDays), 10);
  if (!Number.isFinite(deliveryDays)) deliveryDays = 7;
  deliveryDays = Math.min(90, Math.max(1, deliveryDays));

  let priceSuggestion = null;
  if (parsed.priceSuggestion != null && parsed.priceSuggestion !== "") {
    const n = Number(parsed.priceSuggestion);
    if (Number.isFinite(n) && n > 0) priceSuggestion = Math.round(n);
  }

  return {
    coverLetter: parsed.coverLetter.trim(),
    deliveryDays,
    priceSuggestion,
  };
}

module.exports = { generateProposalDraft };
