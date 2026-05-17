const mongoose = require("mongoose");

const assistantSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "Nouvelle conversation" },
  },
  { timestamps: true }
);

assistantSessionSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model("AssistantSession", assistantSessionSchema);
