const Project = require("../models/project");
const User = require("../models/User");
const Proposal = require("../models/proposal");

// ─── 1. STATS ────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const totalUsers    = await User.countDocuments();
    const clients       = await User.countDocuments({ role: "client" });
    const freelancers   = await User.countDocuments({ role: "freelancer" });

    const open          = await Project.countDocuments({ status: "open" });
    const inProgress    = await Project.countDocuments({ status: "in_progress" });
    const completed     = await Project.countDocuments({ status: "completed" });

    const escrowProjects = await Project.find({ paymentStatus: "escrow_locked" });
    const escrowTotal    = escrowProjects.reduce(
      (sum, p) => sum + (p.escrowAmount || p.budget || 0),
      0
    );

    res.json({
      users:    { total: totalUsers, clients, freelancers },
      projects: { open, inProgress, completed },
      escrow:   { total: escrowTotal },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 2. TOUS LES UTILISATEURS ─────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 3. SUPPRIMER UN UTILISATEUR ─────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
    res.json({ message: "Utilisateur supprimé ✅" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 4. BLOQUER / DÉBLOQUER UN UTILISATEUR ───────────────────────────────────
exports.toggleBlock = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      message: user.isBlocked ? "Utilisateur bloqué 🚫" : "Utilisateur débloqué ✅",
      isBlocked: user.isBlocked,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 5. TOUS LES PROJETS (ADMIN) ─────────────────────────────────────────────
exports.getAllProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate("owner", "name email avatar")
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 6b. DEMANDES D’ANNULATION CLIENT ──────────────────────────────────────────
exports.getCancellationRequests = async (req, res) => {
  try {
    const projects = await Project.find({
      cancellationRequested: true,
      paymentStatus: "escrow_locked",
    })
      .populate("owner", "name email")
      .populate("acceptedFreelancer", "name email")
      .populate({
        path: "selectedProposal",
        populate: { path: "freelancer", select: "name email" },
      })
      .sort({ cancellationRequestedAt: -1 });

    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveCancellationRequest = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }
    if (!project.cancellationRequested) {
      return res.status(400).json({ message: "Aucune demande d’annulation pour ce projet" });
    }
    if (project.paymentStatus !== "escrow_locked") {
      return res.status(400).json({ message: "Ce projet n’est plus en escrow" });
    }

    const refundAmount = project.escrowAmount || project.budget || 0;
    if (refundAmount > 0 && project.owner) {
      await User.findByIdAndUpdate(project.owner, {
        $inc: { walletBalance: refundAmount },
      });
    }

    await Proposal.deleteMany({ project: project._id });
    await Project.findByIdAndDelete(project._id);

    res.json({
      message:
        "Annulation approuvée : le client a été remboursé (escrow → wallet) et la mission a été supprimée.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rejectCancellationRequest = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }
    if (!project.cancellationRequested) {
      return res.status(400).json({ message: "Aucune demande d’annulation pour ce projet" });
    }

    const note =
      typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";

    project.cancellationRequested = false;
    project.cancellationReviewNote = note;
    await project.save();

    res.json({ message: "Demande d’annulation refusée." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 6. PROJETS EN ESCROW ────────────────────────────────────────────────────
exports.getEscrowProjects = async (req, res) => {
  try {
    const projects = await Project.find({ paymentStatus: "escrow_locked" })
      .populate("owner", "name email")
      .populate("acceptedFreelancer", "name email")
      .populate({
        path: "selectedProposal",
        populate: { path: "freelancer", select: "name email" },
      })
      .sort({ updatedAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 7. LIBÉRER LES FONDS (après validation client du livrable) ────────────
exports.releaseFunds = async (req, res) => {
  try {
    const { projectId } = req.body;
    const project = await Project.findById(projectId).populate("selectedProposal");

    if (!project || project.paymentStatus !== "escrow_locked") {
      return res.status(400).json({ message: "Projet non éligible au paiement" });
    }

    const subSt = project.adminWorkSubmission?.status;
    const clientOk =
      subSt === "client_approved" || subSt === "approved";
    if (!clientOk) {
      return res.status(400).json({
        message:
          "Le client doit d’abord valider le livrable dans l’app. Libération impossible pour l’instant.",
      });
    }

    project.paymentStatus = "released";
    project.escrowStatus = "released";
    project.status        = "completed";
    await project.save();

    const payAmount = project.escrowAmount || project.budget || 0;
    if (project.selectedProposal?.freelancer && payAmount > 0) {
      await User.findByIdAndUpdate(project.selectedProposal.freelancer, {
        $inc: { walletBalance: payAmount },
      });
    }

    const io = req.app.get("socketio");
    if (io && project.acceptedFreelancer) {
      io.to(project.acceptedFreelancer.toString()).emit("notification", {
        title: "Paiement reçu 💸",
        message:
          "L’administration a libéré l’escrow — le montant est sur votre wallet.",
        projectId: project._id,
      });
    }
    if (io && project.owner) {
      io.to(project.owner.toString()).emit("notification", {
        title: "Mission clôturée ✓",
        message: `« ${project.title} » : le paiement a été envoyé au freelancer.`,
        projectId: project._id,
      });
    }

    res.json({ message: "Fonds libérés avec succès ✅" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 8. REMBOURSER LE CLIENT ─────────────────────────────────────────────────
exports.refundClient = async (req, res) => {
  try {
    // Supporte projectId depuis req.body OU req.params.id
    const projectId = req.body.projectId || req.params.id;
    const project   = await Project.findById(projectId);

    if (!project || project.paymentStatus !== "escrow_locked") {
      return res.status(400).json({ message: "Impossible de rembourser" });
    }

    project.paymentStatus = "refunded";
    project.escrowStatus = "refunded";
    project.status        = "cancelled";
    await project.save();

    const refundAmount = project.escrowAmount || project.budget || 0;
    if (refundAmount > 0 && project.owner) {
      await User.findByIdAndUpdate(project.owner, {
        $inc: { walletBalance: refundAmount },
      });
    }

    res.json({ message: "Client remboursé avec succès 💸" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 8b. LIVRABLE FREELANCER — VÉRIFICATION ADMIN ─────────────────────────────
/** Missions en escrow dont le client a validé le livrable — prêtes pour libération admin. */
exports.getPendingWorkSubmissions = async (req, res) => {
  try {
    const projects = await Project.find({
      "adminWorkSubmission.status": { $in: ["client_approved", "approved"] },
      paymentStatus: "escrow_locked",
    })
      .populate("owner", "name email")
      .populate("acceptedFreelancer", "name email")
      .sort({ "adminWorkSubmission.reviewedAt": -1 });

    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveWorkSubmissionAndRelease = async (req, res) => {
  return res.status(410).json({
    message:
      "Flux obsolète : le client valide le livrable dans l’app, puis utilisez « Libérer » dans le tableau escrow.",
  });
};

exports.rejectWorkSubmission = async (req, res) => {
  return res.status(410).json({
    message:
      "Le refus du livrable est effectué par le client dans l’application.",
  });
};

// ─── 9. LITIGES ──────────────────────────────────────────────────────────────
exports.getDisputes = async (req, res) => {
  try {
    const disputes = await Project.find({ status: "disputed" })
      .populate("owner", "name email")
      .populate("acceptedFreelancer", "name email")
      .sort({ createdAt: -1 });
    res.json(disputes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── 10. RÉSOUDRE UN LITIGE ──────────────────────────────────────────────────
exports.resolveDispute = async (req, res) => {
  try {
    const { decision, note } = req.body; // 'freelancer' | 'client'
    const project = await Project.findById(req.params.id).populate("selectedProposal");

    if (!project) return res.status(404).json({ message: "Projet non trouvé" });

    if (decision === "freelancer") {
      project.paymentStatus = "released";
      project.status        = "completed";

      const payAmount = project.escrowAmount || project.budget || 0;
      if (project.selectedProposal?.freelancer && payAmount > 0) {
        await User.findByIdAndUpdate(project.selectedProposal.freelancer, {
          $inc: { walletBalance: payAmount },
        });
      }
    } else if (decision === "client") {
      project.paymentStatus = "refunded";
      project.escrowStatus = "refunded";
      project.status        = "cancelled";

      const refundAmount = project.escrowAmount || project.budget || 0;
      if (refundAmount > 0 && project.owner) {
        await User.findByIdAndUpdate(project.owner, {
          $inc: { walletBalance: refundAmount },
        });
      }
    } else {
      return res.status(400).json({ message: "Décision invalide" });
    }

    if (note) project.disputeResolutionNote = note;
    await project.save();

    res.json({ message: `Litige résolu en faveur du ${decision} ✅`, project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};