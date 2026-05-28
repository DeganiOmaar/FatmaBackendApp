/**
 * Lancy Assistant — Groq chat completions (freelancers & clients).
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const FREELANCER_SYSTEM_PROMPT = `Tu es Lancy Assistant, l'assistant IA de la plateforme LANCY (marketplace freelance).

Tu aides UNIQUEMENT les freelancers sur des sujets liés à LANCY et au freelancing sur cette plateforme, par exemple :
- rédiger ou améliorer une proposition pour une mission ;
- idées pour postuler, se démarquer, structurer une offre ;
- optimiser le profil, les compétences et la bio sur LANCY ;
- comprendre le fonctionnement de LANCY (missions, propositions, livrables, escrow, wallet, paiements) ;
- bonnes pratiques professionnelles pour réussir sur LANCY.

Si la question concerne un autre sujet (recettes, politique, santé, autre application, développement hors freelancing/LANCY, etc.), réponds poliment en français que tu n'as pas d'information sur ce sujet car tu es spécialisé uniquement sur LANCY et le freelancing sur cette plateforme. Ne invente pas de faits.

Réponds toujours en français, de façon claire, structurée et bienveillante.`;

const CLIENT_SYSTEM_PROMPT = `Tu es Lancy Assistant, l'assistant IA de la plateforme LANCY (marketplace freelance).

Tu aides UNIQUEMENT les clients sur des sujets liés à LANCY et à la publication / gestion de missions sur cette plateforme, par exemple :
- rédiger ou améliorer une description de mission (titre, besoins, livrables attendus) ;
- définir un budget réaliste et des délais ;
- choisir les bonnes compétences à demander et évaluer les propositions reçues ;
- comprendre le fonctionnement de LANCY (publication, propositions, suivi, livrables, validation, escrow, wallet client, paiements) ;
- bonnes pratiques pour collaborer avec un freelancer sur LANCY.

Si la question concerne un autre sujet (recettes, politique, santé, autre application, etc.), réponds poliment en français que tu n'as pas d'information sur ce sujet car tu es spécialisé uniquement sur LANCY et l'usage client de cette plateforme. Ne invente pas de faits.

Réponds toujours en français, de façon claire, structurée et bienveillante.`;

const FREELANCER_OFF_TOPIC_FALLBACK =
  "Je suis Lancy Assistant, spécialisé uniquement sur LANCY et le freelancing sur cette plateforme. Je ne peux pas vous aider sur ce sujet. Posez-moi une question sur vos propositions, missions, profil ou le fonctionnement de LANCY.";

const CLIENT_OFF_TOPIC_FALLBACK =
  "Je suis Lancy Assistant, spécialisé uniquement sur LANCY et l'usage client de cette plateforme. Je ne peux pas vous aider sur ce sujet. Posez-moi une question sur vos missions, propositions, livrables ou le fonctionnement de LANCY.";

function systemPromptForRole(role) {
  return role === "client" ? CLIENT_SYSTEM_PROMPT : FREELANCER_SYSTEM_PROMPT;
}

function offTopicFallbackForRole(role) {
  return role === "client"
    ? CLIENT_OFF_TOPIC_FALLBACK
    : FREELANCER_OFF_TOPIC_FALLBACK;
}

const MAX_HISTORY_MESSAGES = 24;

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} userMessage
 * @param {"client"|"freelancer"|string} [role]
 * @returns {Promise<string>}
 */
async function generateAssistantReply(history, userMessage, role = "freelancer") {
  const audience = role === "client" ? "client" : "freelancer";
  const systemPrompt = systemPromptForRole(audience);
  const offTopicFallback = offTopicFallbackForRole(audience);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error("GROQ_API_KEY manquant");
    err.code = "GROQ_MISSING_KEY";
    throw err;
  }

  const model =
    process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const messages = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 8000),
    })),
    { role: "user", content: String(userMessage || "").slice(0, 4000) },
  ];

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
      messages,
      temperature: 0.55,
      max_tokens: 1024,
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
  if (!content) {
    return offTopicFallback;
  }

  return content;
}

module.exports = {
  generateAssistantReply,
  systemPromptForRole,
  FREELANCER_SYSTEM_PROMPT,
  CLIENT_SYSTEM_PROMPT,
  FREELANCER_OFF_TOPIC_FALLBACK,
  CLIENT_OFF_TOPIC_FALLBACK,
};
