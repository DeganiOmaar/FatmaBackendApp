const express = require("express");
const router = express.Router();
const Project = require("../models/project");
const User = require("../models/User");
const Proposal = require("../models/proposal");
const { requireAuth, optionalAuth } = require("../middleware/authMiddleware");
const { uploadDelivery } = require("../config/cloudinary");

const projectController = require("../controllers/projectController");
// =======================
// LIST ALL PROJECTS (freelancer missions / marketplace)
// =======================
router.get("/", optionalAuth, projectController.getProjects);

// =======================
// ADD PROJECT
// =======================
router.post("/add", requireAuth, async (req, res) => {
  try {
    const { title, description, budget, clientEmail, requiredSkills } = req.body;

    let reqSkills = [];
    if (Array.isArray(requiredSkills)) {
      reqSkills = [
        ...new Set(
          requiredSkills
            .map((s) => String(s || "").trim())
            .filter(Boolean)
        ),
      ].slice(0, 8);
    }

    const client = await User.findOne({ email: clientEmail });

    if (!client) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    if (client._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Vous ne pouvez publier que pour votre compte" });
    }

    if (client.role !== "client") {
      return res.status(403).json({ message: "Seuls les clients peuvent publier une mission" });
    }

    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      return res.status(400).json({ message: "Budget invalide" });
    }

    const reserved = await User.findOneAndUpdate(
      {
        _id: client._id,
        role: "client",
        walletBalance: { $gte: budgetNum }
      },
      { $inc: { walletBalance: -budgetNum } },
      { new: true }
    );

    if (!reserved) {
      return res.status(400).json({
        message: "Solde wallet insuffisant",
        code: "INSUFFICIENT_WALLET",
        balance: client.walletBalance ?? 0
      });
    }

    const newProject = new Project({
      title,
      description,
      budget: budgetNum,
      owner: client._id,
      requiredSkills: reqSkills,
      status: "open",
      paymentStatus: "not_locked",
      escrowStatus: "not_locked",
      fundedFromWallet: true
    });

    try {
      await newProject.save();
    } catch (saveErr) {
      await User.findByIdAndUpdate(client._id, { $inc: { walletBalance: budgetNum } });
      throw saveErr;
    }

    res.status(201).json({
      message: "Projet ajouté",
      project: newProject,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// =======================
// MY PROJECTS
// =======================
router.get("/my", requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({ owner: req.user._id })
      .populate("acceptedFreelancer", "name email")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get(
  "/my/confirmed-deliveries",
  requireAuth,
  projectController.getClientConfirmedDeliveries
);


// =======================
// DELIVER PROJECT
// =======================
router.put("/:id/deliver", requireAuth, uploadDelivery.single("file"), async (req, res) => {
  try {
    const io = req.app.get("socketio");

    const projectId = req.params.id;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    project.status = "delivered";
    project.delivery = {
      file: req.file ? req.file.path : null,   // Cloudinary URL
      link: req.body.link || null,
      message: req.body.message || "",
    };

    await project.save();

    // 🔥 notif client
    io.to(project.owner.toString()).emit("notification", {
      title: "Travail livré 📦",
      message: "Le freelancer a livré votre projet",
      projectId: project._id
    });

    res.json({ success: true, project });

  } catch (err) {
    console.error("❌ Deliver error:", err);
    res.status(500).json({ error: err.message });
  }
});
// =======================
// FREELANCER — MES MISSIONS ACCEPTÉES
// =======================
router.get("/freelancer", requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({ 
      acceptedFreelancer: req.user._id,
      status: { $in: ["in_progress", "delivered", "completed"] }
    })
      .populate("owner", "name email avatar")
      .populate("acceptedFreelancer", "name email")
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get(
  "/:id/participant-meta",
  requireAuth,
  projectController.getProjectParticipantMeta
);

router.post(
  "/:id/submit-admin-delivery",
  requireAuth,
  uploadDelivery.array("files", 20),
  projectController.submitWorkForAdminReview
);

router.post(
  "/:id/approve-client-submission",
  requireAuth,
  projectController.approveClientWorkSubmission
);

router.post(
  "/:id/reject-client-submission",
  requireAuth,
  projectController.rejectClientWorkSubmission
);

// ========================
// REFUSER LA LIVRAISON
// ========================
router.put("/:id/reject-delivery", requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const project = await Project.findById(req.params.id)
      .populate("acceptedFreelancer", "_id");

    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    // Remet le projet en cours
    project.status   = "in_progress";
    project.delivery = null;
    await project.save();

    // Notif socket au freelancer
    const io = req.app.get("socketio");
    if (io && project.acceptedFreelancer) {
      io.to(project.acceptedFreelancer._id.toString()).emit("notification", {
        title: "Livraison refusée ❌",
        message: reason || "Le client a refusé votre livraison. Veuillez corriger et relivrer.",
        projectId: project._id,
      });
    }

    res.json({ message: "Livraison refusée", project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/stats", requireAuth, projectController.getStats);
router.put(
  "/refuse/:id",
  requireAuth,
  projectController.refuseDelivery
);
// UPDATE PROJECT
router.put("/update/:id", requireAuth, projectController.updateProject);

// DELETE PROJECT
router.delete("/delete/:id", requireAuth, projectController.deleteProject);
// CLIENT — demande d’annulation (escrow + validation admin)
router.post(
  "/:id/request-cancellation",
  requireAuth,
  projectController.requestMissionCancellation
);
module.exports = router;