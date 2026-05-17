const AssistantSession = require("../models/assistantSession");
const AssistantMessage = require("../models/assistantMessage");
const { generateAssistantReply } = require("../services/groqAssistantService");

function handleGroqError(res, err) {
  console.error("❌ assistant:", err.message);
  if (err.code === "GROQ_MISSING_KEY") {
    return res.status(503).json({
      message:
        "Assistant IA non configuré : ajoutez GROQ_API_KEY dans le fichier .env du serveur",
    });
  }
  if (err.code === "FETCH_UNAVAILABLE") {
    return res.status(500).json({ message: err.message });
  }
  if (err.code === "GROQ_HTTP_ERROR" && err.status === 429) {
    return res.status(429).json({
      message: "Limite Groq atteinte, réessayez dans quelques instants",
    });
  }
  return res.status(500).json({
    message: err.message || "Erreur de l'assistant",
  });
}

async function assertFreelancer(req, res) {
  if (req.user.role !== "freelancer") {
    res.status(403).json({ message: "Réservé aux freelancers" });
    return false;
  }
  return true;
}

async function loadOwnedSession(sessionId, userId) {
  return AssistantSession.findOne({ _id: sessionId, userId });
}

function sessionTitleFromMessage(text) {
  const t = String(text || "").trim().replace(/\s+/g, " ");
  if (!t) return "Nouvelle conversation";
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

/** GET /api/assistant/sessions */
exports.listSessions = async (req, res) => {
  try {
    if (!(await assertFreelancer(req, res))) return;

    const sessions = await AssistantSession.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    res.json({
      sessions: sessions.map((s) => ({
        id: s._id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** POST /api/assistant/sessions */
exports.createSession = async (req, res) => {
  try {
    if (!(await assertFreelancer(req, res))) return;

    const session = await AssistantSession.create({
      userId: req.user._id,
      title: "Nouvelle conversation",
    });

    res.status(201).json({
      session: {
        id: session._id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/assistant/sessions/:sessionId/messages */
exports.getMessages = async (req, res) => {
  try {
    if (!(await assertFreelancer(req, res))) return;

    const session = await loadOwnedSession(
      req.params.sessionId,
      req.user._id
    );
    if (!session) {
      return res.status(404).json({ message: "Conversation introuvable" });
    }

    const messages = await AssistantMessage.find({
      sessionId: session._id,
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      session: {
        id: session._id,
        title: session.title,
      },
      messages: messages.map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** POST /api/assistant/sessions/:sessionId/messages */
exports.sendMessage = async (req, res) => {
  try {
    if (!(await assertFreelancer(req, res))) return;

    const { message } = req.body;
    const text = String(message || "").trim();
    if (!text) {
      return res.status(400).json({ message: "message requis" });
    }
    if (text.length > 4000) {
      return res.status(400).json({ message: "Message trop long (max 4000)" });
    }

    const session = await loadOwnedSession(
      req.params.sessionId,
      req.user._id
    );
    if (!session) {
      return res.status(404).json({ message: "Conversation introuvable" });
    }

    const prior = await AssistantMessage.find({ sessionId: session._id })
      .sort({ createdAt: 1 })
      .lean();

    const history = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const userDoc = await AssistantMessage.create({
      sessionId: session._id,
      role: "user",
      content: text,
    });

    let assistantText;
    try {
      assistantText = await generateAssistantReply(history, text);
    } catch (err) {
      await AssistantMessage.deleteOne({ _id: userDoc._id });
      return handleGroqError(res, err);
    }

    const assistantDoc = await AssistantMessage.create({
      sessionId: session._id,
      role: "assistant",
      content: assistantText,
    });

    if (
      session.title === "Nouvelle conversation" &&
      prior.length === 0
    ) {
      session.title = sessionTitleFromMessage(text);
    }
    session.updatedAt = new Date();
    await session.save();

    res.json({
      userMessage: {
        id: userDoc._id,
        role: "user",
        content: userDoc.content,
        createdAt: userDoc.createdAt,
      },
      assistantMessage: {
        id: assistantDoc._id,
        role: "assistant",
        content: assistantDoc.content,
        createdAt: assistantDoc.createdAt,
      },
      session: {
        id: session._id,
        title: session.title,
        updatedAt: session.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** DELETE /api/assistant/sessions/:sessionId */
exports.deleteSession = async (req, res) => {
  try {
    if (!(await assertFreelancer(req, res))) return;

    const session = await loadOwnedSession(
      req.params.sessionId,
      req.user._id
    );
    if (!session) {
      return res.status(404).json({ message: "Conversation introuvable" });
    }

    await AssistantMessage.deleteMany({ sessionId: session._id });
    await AssistantSession.deleteOne({ _id: session._id });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
