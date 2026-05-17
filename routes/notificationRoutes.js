const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");
const Notification = require("../models/notification");

// GET notifications
router.get("/", requireAuth, async (req, res) => {
  try {
    const data = await Notification.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// read all
router.put("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id },
      { read: true }
    );

    res.json({ message: "ok" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;