const express = require("express");
const router = express.Router();

const {
  createProposal,
  getProjectProposals,
  acceptProposal,
  rejectProposal,
  generateAiProposalDraft,
} = require("../controllers/proposalController");

const { requireAuth } = require("../middleware/authMiddleware");

router.post("/ai-draft", requireAuth, generateAiProposalDraft);
router.post("/", requireAuth, createProposal);
router.get("/project/:id", requireAuth, getProjectProposals);
router.put("/:id/accept", requireAuth, acceptProposal);
router.put("/:id/reject", requireAuth, rejectProposal);
module.exports = router;