const express = require("express");
const router  = express.Router();

const adminController   = require("../controllers/adminController");
const { requireAuth, isAdmin } = require("../middleware/authMiddleware");

// Applique auth + rôle admin sur toutes les routes de ce fichier
// router.use(requireAuth, isAdmin);   // ← Décommente en prod

// ─── STATS ────────────────────────────────────────────────────────────────────
// GET /api/admin/stats
router.get("/stats", adminController.getStats);

// ─── UTILISATEURS ─────────────────────────────────────────────────────────────
// GET    /api/admin/users
// DELETE /api/admin/users/:id          (archive — soft delete)
// PUT    /api/admin/users/:id/toggle-block
router.get("/users",                   adminController.getAllUsers);
router.delete("/users/:id",            adminController.archiveUser);
router.put("/users/:id/toggle-block",  adminController.toggleBlock);

// ─── PROJETS ──────────────────────────────────────────────────────────────────
// GET    /api/admin/projects
// DELETE /api/admin/projects/:id
router.get("/projects", adminController.getAllProjects);
router.delete("/projects/:id", adminController.deleteProject);

// ─── ESCROW — DEMANDES D’ANNULATION CLIENT ───────────────────────────────────
// GET  /api/admin/cancellation-requests
// POST /api/admin/cancellation-requests/:projectId/approve
// POST /api/admin/cancellation-requests/:projectId/reject   { note? }
router.get("/cancellation-requests", adminController.getCancellationRequests);
router.post(
  "/cancellation-requests/:projectId/approve",
  adminController.approveCancellationRequest
);
router.post(
  "/cancellation-requests/:projectId/reject",
  adminController.rejectCancellationRequest
);

// ─── LIVRABLES (freelancer → admin) ─────────────────────────────────────────
// GET  /api/admin/work-submissions/pending
// POST /api/admin/work-submissions/:projectId/approve-release
// POST /api/admin/work-submissions/:projectId/reject   { note? }
router.get("/work-submissions/pending", adminController.getPendingWorkSubmissions);
router.post(
  "/work-submissions/:projectId/approve-release",
  adminController.approveWorkSubmissionAndRelease
);
router.post(
  "/work-submissions/:projectId/reject",
  adminController.rejectWorkSubmission
);

// ─── ESCROW ───────────────────────────────────────────────────────────────────
// GET  /api/admin/escrow-projects
// POST /api/admin/release-funds      { projectId }
// POST /api/admin/refund/:id
router.get("/escrow-projects",   adminController.getEscrowProjects);
router.post("/release-funds",    adminController.releaseFunds);
router.post("/refund/:id",       adminController.refundClient);

// ─── LITIGES ──────────────────────────────────────────────────────────────────
// GET /api/admin/disputes
// PUT /api/admin/disputes/:id/resolve   { decision, note }
router.get("/disputes",                  adminController.getDisputes);
router.put("/disputes/:id/resolve",      adminController.resolveDispute);
router.get('/escrow', async (req, res) => {
  try {
    const Project = require("../models/project");

    const projects = await Project.find({ escrowStatus: "locked" })
      .populate("owner", "name email")
      .populate("acceptedFreelancer", "name email");

    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;