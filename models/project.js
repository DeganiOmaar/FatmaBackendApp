const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  budget: { type: Number, required: true },

  /** Compétences recherchées pour la mission (libellés alignés avec le catalogue app). */
  requiredSkills: { type: [String], default: [] },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  acceptedFreelancer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  selectedProposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal',
    default: null
  },

  status: {
    type: String,
    enum: ["open", "in_progress", "delivered", "completed", "cancelled", "disputed"],
    default: "open"
  },

  dispute: {
    isOpen: { type: Boolean, default: false },
    reason: { type: String, default: '' },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    openedAt: Date
  },

  paymentStatus: {
    type: String,
    enum: ["not_locked", "escrow_locked", "released", "refunded"],
    default: "not_locked"
  },

  escrowStatus: {
    type: String,
    enum: ["not_locked", "locked", "released", "refunded"],
    default: "not_locked"
  },

  delivery: {
    message: { type: String, default: "" },
    file: { type: String, default: "" },
    link: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "delivered", "accepted", "refused"],
      default: "pending"
    }
  },

  escrowAmount: { type: Number, default: 0 },

  /** Budget prélevé du wallet client à la création du projet */
  fundedFromWallet: { type: Boolean, default: false },

  /** Client demande l’annulation (fonds en escrow) — traitement admin requis */
  cancellationRequested: { type: Boolean, default: false },
  cancellationReason: { type: String, default: '' },
  cancellationRequestedAt: { type: Date, default: null },
  /** Note laissée par l’admin si la demande est refusée */
  cancellationReviewNote: { type: String, default: '' },

  /**
   * Livrable freelancer → client : après client_approved, l’admin peut libérer l’escrow.
   * Valeurs legacy encore acceptées en lecture : pending_review, approved, rejected.
   */
  adminWorkSubmission: {
    status: {
      type: String,
      enum: [
        'none',
        'pending_client',
        'client_approved',
        'client_rejected',
        'pending_review',
        'approved',
        'rejected',
      ],
      default: 'none',
    },
    message: { type: String, default: '' },
    demoLink: { type: String, default: '' },
    files: [
      {
        filename: { type: String, required: true },
        originalName: { type: String, default: '' },
        mimeType: { type: String, default: '' },
        size: { type: Number, default: 0 },
      },
    ],
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
}, { timestamps: true });
module.exports = mongoose.models.Project || mongoose.model("Project", projectSchema);