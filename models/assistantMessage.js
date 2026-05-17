const mongoose = require("mongoose");

const assistantMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssistantSession",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

assistantMessageSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model("AssistantMessage", assistantMessageSchema);
