const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const assistantController = require("../controllers/assistantController");

router.use(requireAuth);

router.get("/sessions", assistantController.listSessions);
router.post("/sessions", assistantController.createSession);
router.get("/sessions/:sessionId/messages", assistantController.getMessages);
router.post("/sessions/:sessionId/messages", assistantController.sendMessage);
router.delete("/sessions/:sessionId", assistantController.deleteSession);

module.exports = router;
