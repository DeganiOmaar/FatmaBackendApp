const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Project = require('../models/project');

exports.processPayment = async (req, res) => {
  try {
    const { projectId } = req.body;
    const project = await Project.findById(projectId);

    if (!project) return res.status(404).json({ message: "Projet non trouvé" });

    // Création de l'intention de paiement
    const paymentIntent = await stripe.paymentIntents.create({
      amount: project.budget * 100, 
      currency: 'usd',
      metadata: { projectId: project._id.toString() },
      automatic_payment_methods: { enabled: true },
    });

    // On met à jour le statut du projet en attendant la confirmation
    project.escrowStatus = 'pending_payment';
    await project.save();

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.stripeWebhook = async (req, res) => {
  const event = req.body;

  if (event.type === "payment_intent.succeeded") {

    const paymentIntent = event.data.object;
    const projectId = paymentIntent.metadata.projectId;

    const project = await Project.findById(projectId);

    if (!project) return res.sendStatus(404);

    // 🔒 HERE IS ESCROW LOCK
    project.escrowStatus = "locked";
    project.paymentStatus = "escrow_locked";

    await project.save();

    console.log("ESCROW LOCKED 🔒 for project:", projectId);
  }

  res.json({ received: true });
};
// Confirmation après succès sur Flutter
