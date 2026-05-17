const express = require("express");
const router = express.Router();
const Message = require("../models/message");
const Project = require("../models/project");
const { broadcastSavedMessage } = require("../utils/chatBroadcast");
const { canParticipantsChat } = require("../utils/chatAccess");

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

module.exports = router;