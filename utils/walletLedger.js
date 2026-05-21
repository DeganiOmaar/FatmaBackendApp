const User = require("../models/User");
const Project = require("../models/project");
const stripe = require("../config/stripe");

/**
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @param {{ type: 'topup'|'project_funding'|'refund', amount: number, label?: string, refId?: string, createdAt?: Date }} entry
 */
async function appendWalletLedger(userId, entry) {
  const refId = entry.refId ? String(entry.refId) : "";
  if (refId) {
    const exists = await User.findOne({
      _id: userId,
      "walletLedger.refId": refId,
    }).select("_id");
    if (exists) return;
  }

  await User.findByIdAndUpdate(userId, {
    $push: {
      walletLedger: {
        type: entry.type,
        amount: entry.amount,
        label: entry.label || "",
        refId,
        createdAt: entry.createdAt || new Date(),
      },
    },
  });
}

/** Backfill ledger from Stripe top-ups + wallet-funded projects (one-time per ref). */
async function ensureClientWalletLedger(user) {
  if (!user || user.role !== "client") return user;

  const ids = user.processedWalletTopUpIntentIds || [];
  for (const piId of ids) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.metadata?.purpose !== "wallet_topup") continue;
      const cents = pi.amount_received != null ? pi.amount_received : pi.amount;
      const euros = cents / 100;
      await appendWalletLedger(user._id, {
        type: "topup",
        amount: euros,
        label: "Recharge wallet",
        refId: `topup:${piId}`,
        createdAt: pi.created ? new Date(pi.created * 1000) : new Date(),
      });
    } catch (err) {
      console.warn("walletLedger backfill topup:", piId, err.message);
    }
  }

  const funded = await Project.find({
    owner: user._id,
    fundedFromWallet: true,
  }).select("title budget createdAt _id");

  for (const p of funded) {
    await appendWalletLedger(user._id, {
      type: "project_funding",
      amount: -(p.budget || 0),
      label: p.title || "Mission publiée",
      refId: `project:${p._id}`,
      createdAt: p.createdAt,
    });
  }

  return User.findById(user._id).select(
    "walletBalance role walletLedger processedWalletTopUpIntentIds"
  );
}

function formatLedgerForApi(ledger) {
  return (ledger || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((t) => {
      const amount = Number(t.amount) || 0;
      const isCredit = amount >= 0;
      return {
        type: t.type,
        title: t.label || (t.type === "topup" ? "Recharge wallet" : "Mission"),
        amount: Math.abs(amount),
        signedAmount: amount,
        direction: isCredit ? "credit" : "debit",
        createdAt: t.createdAt,
      };
    });
}

module.exports = {
  appendWalletLedger,
  ensureClientWalletLedger,
  formatLedgerForApi,
};
