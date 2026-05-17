const Proposal = require("../models/proposal");
const Project = require("../models/project");
const Notification = require("../models/notification");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { generateProposalDraft } = require("../services/groqProposalService");

// =======================
// CREATE PROPOSAL
// =======================
const createProposal = async (req, res) => {
  try {
    const { projectId, price, deliveryTime, coverLetter } = req.body;

    const project = await Project.findById(projectId).populate("owner");

    if (!project)
      return res.status(404).json({ message: "Projet non trouvé" });

    const existing = await Proposal.findOne({
      project: projectId,
      freelancer: req.user._id,
    });

    if (existing)
      return res.status(400).json({ message: "Déjà envoyé" });

    const proposal = await Proposal.create({
      project: projectId,
      freelancer: req.user._id,
      price,
      deliveryTime,
      coverLetter,
      status: "pending",
    });

    // ✅ Notification → client
    const notif = await Notification.create({
      userId: project.owner._id,
      title: "Nouvelle proposition 💼",
      message: `${req.user.name} a envoyé une proposition pour : "${project.title}"`,
    });

    // ✅ "socketio" au lieu de "io"
    const io = req.app.get("socketio");
    if (io) {
      const roomId = project.owner._id.toString();
      console.log(`🚀 Notification envoyée à room : ${roomId}`);
      io.to(roomId).emit("notification", {
        title: notif.title,
        message: notif.message,
      });
    }

    res.status(201).json({ message: "Proposition envoyée", proposal });
  } catch (err) {
    console.log("❌ Erreur createProposal:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// =======================
// GET PROPOSALS
// =======================
const getProjectProposals = async (req, res) => {
  try {
    const projectDoc = await Project.findById(req.params.id);
    if (!projectDoc) {
      return res.status(404).json({ message: "Projet introuvable" });
    }
    if (projectDoc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Non autorisé" });
    }

    const proposals = await Proposal.find({ project: req.params.id })
      .populate("freelancer", "name email avatar")
      .populate("project");

    res.json(proposals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =======================
// ACCEPT PROPOSAL (ESCROW)
// =======================
const acceptProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate("project")
      .populate("freelancer", "name email");

    if (!proposal || !proposal.project) {
      return res.status(404).json({ message: "Proposition introuvable" });
    }

    const projectRef = proposal.project;
    const ownerId =
      projectRef.owner?._id?.toString?.() ?? projectRef.owner?.toString();

    if (!ownerId || ownerId !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Action réservée au client propriétaire",
      });
    }

    if (proposal.status !== "pending") {
      return res.status(400).json({ message: "Proposition déjà traitée" });
    }

    const clientId = projectRef.owner?._id ?? projectRef.owner;
    const freelancerId = proposal.freelancer?._id ?? proposal.freelancer;

    const projectDoc = await Project.findById(projectRef._id);
    if (!projectDoc) {
      return res.status(404).json({ message: "Projet introuvable" });
    }

    const price = Number(proposal.price);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Montant de proposition invalide" });
    }

    /**
     * Missions créées avec /projects/add : le budget a déjà été débité du wallet client.
     * À l’acceptation : on retient `price` en escrow et on rend l’excédent (budget − price).
     */
    if (projectDoc.fundedFromWallet) {
      if (price > projectDoc.budget + 1e-9) {
        return res.status(400).json({
          message: "Le montant accepté dépasse le budget réservé pour cette mission",
          budget: projectDoc.budget,
        });
      }
      const excess = projectDoc.budget - price;
      if (excess > 0) {
        await User.findByIdAndUpdate(clientId, { $inc: { walletBalance: excess } });
      }
    } else {
      const reserved = await User.findOneAndUpdate(
        {
          _id: clientId,
          role: "client",
          walletBalance: { $gte: price },
        },
        { $inc: { walletBalance: -price } },
        { new: true }
      );
      if (!reserved) {
        return res.status(400).json({ message: "Solde wallet insuffisant ❌" });
      }
    }

    await Transaction.create({
      from: String(clientId),
      to: "ESCROW",
      amount: price,
      type: "escrow",
    });

    proposal.status = "accepted";
    await proposal.save();

    await Proposal.updateMany(
      {
        project: projectDoc._id,
        _id: { $ne: proposal._id },
        status: "pending",
      },
      { status: "rejected" }
    );

    projectDoc.status = "in_progress";
    projectDoc.escrowAmount = price;
    projectDoc.acceptedFreelancer = freelancerId;
    projectDoc.selectedProposal = proposal._id;
    projectDoc.paymentStatus = "escrow_locked";
    projectDoc.escrowStatus = "locked";
    await projectDoc.save();

    // ✅ Notification → freelancer
    const clientName = req.user.name || "Le client";
    const notifData = {
      title: "Proposition acceptée ! 🎉",
      message: `${clientName} a accepté votre proposition`,
    };

    await Notification.create({
      userId: freelancerId,
      ...notifData,
    });

    // ✅ "socketio" au lieu de "io"
    const io = req.app.get("socketio");
    if (io) {
      const roomId = freelancerId.toString();
      console.log(`🚀 Notification acceptée → room : ${roomId}`);
      io.to(roomId).emit("notification", notifData);
    }

    res.json({ message: "Projet démarré 💰 escrow activé" });
  } catch (err) {
    console.log("❌ Erreur acceptProposal:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// =======================
// REJECT
// =======================
const rejectProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate("project")
      .populate("freelancer", "name email");

    if (!proposal || !proposal.project) {
      return res.status(404).json({ message: "Proposition introuvable" });
    }

    const ownerId =
      proposal.project.owner?._id?.toString?.() ??
      proposal.project.owner?.toString();

    if (!ownerId || ownerId !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Action réservée au client propriétaire",
      });
    }

    if (proposal.status !== "pending") {
      return res.status(400).json({ message: "Proposition déjà traitée" });
    }

    proposal.status = "rejected";
    await proposal.save();

    // ✅ Notification → freelancer
    const clientName = req.user.name || "Le client";
    const freelancerId =
      proposal.freelancer?._id ?? proposal.freelancer;

    const notifData = {
      title: "Proposition refusée",
      message: `${clientName} a refusé votre proposition`,
    };

    await Notification.create({
      userId: freelancerId,
      ...notifData,
    });

    // ✅ "socketio" au lieu de "io"
    const io = req.app.get("socketio");
    if (io) {
      const roomId = freelancerId.toString();
      console.log(`🚀 Notification refusée → room : ${roomId}`);
      io.to(roomId).emit("notification", notifData);
    }

    res.json({ message: "Proposition refusée", proposal });
  } catch (err) {
    console.log("❌ Erreur rejectProposal:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// =======================
// AI DRAFT PROPOSAL (Groq)
// =======================
const generateAiProposalDraft = async (req, res) => {
  try {
    if (req.user.role !== "freelancer") {
      return res.status(403).json({ message: "Réservé aux freelancers" });
    }

    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ message: "projectId requis" });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    if (project.status !== "open") {
      return res
        .status(400)
        .json({ message: "Ce projet n'accepte plus de propositions" });
    }

    const draft = await generateProposalDraft({
      projectTitle: project.title || "",
      projectDescription: project.description || "",
      clientBudget: project.budget,
      freelancerName: req.user.name,
      freelancerSkills: req.user.skills,
      freelancerBio: req.user.bio,
    });

    res.json({
      coverLetter: draft.coverLetter,
      deliveryDays: draft.deliveryDays,
      priceSuggestion: draft.priceSuggestion,
    });
  } catch (err) {
    console.error("❌ generateAiProposalDraft:", err.message);
    if (err.code === "GROQ_MISSING_KEY") {
      return res.status(503).json({
        message:
          "Assistant IA non configuré : ajoutez GROQ_API_KEY dans le fichier .env du serveur",
      });
    }
    if (err.code === "FETCH_UNAVAILABLE") {
      return res.status(500).json({ message: err.message });
    }
    if (err.code === "GROQ_HTTP_ERROR" && err.status === 429) {
      return res.status(429).json({
        message: "Limite Groq atteinte, réessayez dans quelques instants",
      });
    }
    res.status(500).json({
      message:
        err.message ||
        "Erreur lors de la génération de la proposition",
    });
  }
};

// =======================
// EXPORT
// =======================
module.exports = {
  createProposal,
  getProjectProposals,
  acceptProposal,
  rejectProposal,
  generateAiProposalDraft,
};