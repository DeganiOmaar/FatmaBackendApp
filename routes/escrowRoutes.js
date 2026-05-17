const express = require("express");
const router = express.Router();
const Project = require("../models/project");
const {
  getEscrowProjects,
  releaseFunds,
  refundClient
} = require("../controllers/escrowController");

// GET all escrow projects
router.get("/", getEscrowProjects);

// release funds
router.post("/release-funds", releaseFunds);

// refund client
router.post("/refund-client", refundClient);
router.get("/test", async (req, res) => {
  const projects = await Project.find();
  res.json(projects);
});

module.exports = router;