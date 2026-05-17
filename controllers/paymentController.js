const stripe = require("../config/stripe");
const Project = require("../models/project");
const User = require("../models/User");

/** Rechargement wallet client (Stripe, EUR) */
exports.createWalletTopUpIntent = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Réservé aux clients" });
    }

    let { amountEuros } = req.body;
    amountEuros = Number(amountEuros);
    if (!Number.isFinite(amountEuros) || amountEuros < 1 || amountEuros > 50000) {
      return res.status(400).json({ message: "Montant invalide (1 à 50 000 €)" });
    }

    const cents = Math.round(amountEuros * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: cents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        purpose: "wallet_topup",
        userId: req.user._id.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Après succès du Payment Sheet : crédite le wallet tout de suite (pas obligé d’avoir le webhook).
 * Idempotent avec processedWalletTopUpIntentIds (compatible avec le webhook).
 */
exports.confirmWalletTopUp = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ message: "Réservé aux clients" });
    }

    const paymentIntentId = req.body.paymentIntentId;
    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return res.status(400).json({ message: "paymentIntentId requis" });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.metadata?.purpose !== "wallet_topup") {
      return res.status(400).json({ message: "Intention de paiement invalide" });
    }
    if (pi.metadata?.userId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Non autorisé" });
    }
    if (pi.status !== "succeeded") {
      return res.status(400).json({
        message: "Paiement non finalisé",
        status: pi.status
      });
    }

    const cents = pi.amount_received != null ? pi.amount_received : pi.amount;
    const euros = cents / 100;

    const result = await User.updateOne(
      {
        _id: req.user._id,
        processedWalletTopUpIntentIds: { $nin: [paymentIntentId] }
      },
      {
        $inc: { walletBalance: euros },
        $push: { processedWalletTopUpIntentIds: paymentIntentId }
      }
    );

    const user = await User.findById(req.user._id).select("walletBalance");

    if (result.matchedCount === 0) {
      return res.json({
        ok: true,
        balance: user.walletBalance ?? 0,
        alreadyProcessed: true
      });
    }

    return res.json({
      ok: true,
      balance: user.walletBalance ?? 0,
      creditedEuros: euros,
      alreadyProcessed: false
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 🟢 CREATE PAYMENT INTENT (escrow projet) — ou confirmation wallet sans 2e débit Stripe
exports.createPaymentIntent = async (req, res) => {
  try {
    const { projectId } = req.body;

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        message: "Projet introuvable"
      });
    }

    if (project.fundedFromWallet && project.paymentStatus === "not_locked") {
      project.paymentStatus = "escrow_locked";
      project.escrowStatus = "locked";
      if (project.status === "open") {
        project.status = "in_progress";
      }
      await project.save();

      const io = req.app.get("socketio");
      if (io && project.acceptedFreelancer) {
        io.to(project.acceptedFreelancer.toString()).emit("notification", {
          title: "Mission démarrée 🚀",
          message: "Budget confirmé depuis le wallet — escrow activé",
          projectId: project._id
        });
      }

      return res.json({
        clientSecret: null,
        paidFromWallet: true
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(project.budget) * 100),
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        projectId: String(projectId),
        purpose: "project_escrow"
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paidFromWallet: false
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};
exports.releasePayment = async (req, res) => {
  try {
    const { projectId } = req.body;

    const project = await Project.findById(projectId)
      .populate("acceptedFreelancer");

    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    // Escrow : seule l’admin libère après validation client
    if (project.paymentStatus === "escrow_locked") {
      return res.status(403).json({
        message:
          "Les missions en escrow sont libérées par Plateforme après votre validation du livrable dans le suivi de mission.",
      });
    }

    if (!project.acceptedFreelancer) {
      return res.status(400).json({ message: "Freelancer manquant" });
    }

    // ❌ prevent double payment
    if (project.escrowStatus === "released") {
      return res.status(400).json({
        message: "Paiement déjà libéré"
      });
    }

    const freelancerId = project.acceptedFreelancer._id;

    // 💸 wallet update
    await User.findByIdAndUpdate(
      freelancerId,
      { $inc: { walletBalance: project.escrowAmount || project.budget || 0 } }
    );

    // 🔓 update project
    project.escrowStatus = "released";
    project.status = "completed";
    project.paymentStatus = "released";

    await project.save();

    // 🔔 socket notification
    const io = req.app.get("socketio");

    if (io) {
      io.to(freelancerId.toString()).emit("notification", {
        title: "Paiement reçu 💸",
        message: "Escrow libéré par le client",
        projectId: project._id,
      });
    }

    return res.json({
      message: "Paiement libéré avec succès",
      project,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};