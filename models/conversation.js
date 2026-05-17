const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Conversation", conversationSchema);