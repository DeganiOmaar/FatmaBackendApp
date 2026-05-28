const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const Project = require("../models/project");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  broadcastSavedMessage,
  broadcastMessageUpdated,
  broadcastMessageDeleted,
} = require("../utils/chatBroadcast");
const {
  canParticipantsChat,
  isProjectParticipant,
  mongoIdLikeToString,
} = require("../utils/chatAccess");

async function loadMessageForUser(messageId, userId) {
  const msg = await Message.findById(messageId);
  if (!msg) return { error: "Message introuvable", status: 404 };

  const senderStr = mongoIdLikeToString(msg.senderId);
  const userStr = String(userId).trim();
  if (senderStr !== userStr) {
    return { error: "Vous ne pouvez modifier que vos propres messages", status: 403 };
  }

  const project = await Project.findById(msg.projectId).populate([
    { path: "owner", select: "_id" },
    { path: "acceptedFreelancer", select: "_id" },
  ]);
  if (!project) return { error: "Projet introuvable", status: 404 };
  if (!isProjectParticipant(project, userStr)) {
    return { error: "Conversation invalide", status: 403 };
  }

  return { msg, project };
}

// ➜ GET messages (chat history)
router.get("/:projectId", async (req, res) => {
  try {
    const messages = await Message.find({
      projectId: req.params.projectId,
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➜ POST message (persist + broadcast websocket)
router.post("/", async (req, res) => {
  try {
    const { projectId, senderId, receiverId, text } = req.body;

    if (!projectId || !senderId || !receiverId || !String(text ?? "").trim()) {
      return res.status(400).json({ message: "Données message invalides" });
    }

    const project = await Project.findById(projectId).populate([
      { path: "owner", select: "_id" },
      { path: "acceptedFreelancer", select: "_id" },
    ]);
    const chk = canParticipantsChat(project, senderId, receiverId);
    if (chk !== true) {
      return res.status(403).json({ message: chk });
    }

    const message = new Message({
      projectId,
      senderId,
      receiverId,
      text: String(text).trim(),
    });

    await message.save();

    const io = req.app.get("socketio");
    if (io) broadcastSavedMessage(io, message);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➜ PATCH message (edit — sender only)
router.patch("/:messageId", requireAuth, async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) {
      return res.status(400).json({ message: "Le texte du message est requis" });
    }
    if (text.length > 4000) {
      return res.status(400).json({ message: "Message trop long (max 4000)" });
    }

    const loaded = await loadMessageForUser(
      req.params.messageId,
      req.user._id
    );
    if (loaded.error) {
      return res.status(loaded.status).json({ message: loaded.error });
    }

    const { msg } = loaded;
    if (msg.isDeleted) {
      return res
        .status(400)
        .json({ message: "Impossible de modifier un message supprimé" });
    }

    msg.text = text;
    msg.editedAt = new Date();
    await msg.save();

    const io = req.app.get("socketio");
    if (io) broadcastMessageUpdated(io, msg);

    res.status(200).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➜ DELETE message (soft delete — sender only)
router.delete("/:messageId", requireAuth, async (req, res) => {
  try {
    const loaded = await loadMessageForUser(
      req.params.messageId,
      req.user._id
    );
    if (loaded.error) {
      return res.status(loaded.status).json({ message: loaded.error });
    }

    const { msg } = loaded;
    if (!msg.isDeleted) {
      msg.isDeleted = true;
      msg.text = "";
      await msg.save();
    }

    const io = req.app.get("socketio");
    if (io) broadcastMessageDeleted(io, msg);

    res.status(200).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;