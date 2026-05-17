const Message = require("../models/message");
const Project = require("../models/project");

// ✅ SEND MESSAGE
exports.sendMessage = async (req, res) => {
  try {
    const { projectId, senderId, receiverId, text } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ message: "Projet introuvable" });
    }

    // 🚫 IMPORTANT: blocage si pas accepté
    if (!project.acceptedFreelancer) {
      return res.status(403).json({ message: "Chat non autorisé" });
    }

    const message = await Message.create({
      projectId,
      senderId,
      receiverId,
      text,
    });

    // 🔥 SOCKET EMIT
    req.io.to(receiverId).emit("receive_message", message);

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET MESSAGES
exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      projectId: req.params.projectId,
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};