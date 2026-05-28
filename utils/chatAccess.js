/** Vérifie que senderId peut écrire à receiverId pour ce projet mission. */

const mongoose = require("mongoose");

function mongoIdLikeToString(field) {
  if (field == null) return "";
  if (field instanceof mongoose.Types.ObjectId) return String(field);
  if (typeof field === "object" && field._id != null) {
    const id = field._id;
    if (id instanceof mongoose.Types.ObjectId) return String(id);
    return String(id);
  }
  return String(field);
}

function projectParticipantIds(project) {
  const ownerId = mongoIdLikeToString(project.owner);
  const freelancerId = project.acceptedFreelancer
    ? mongoIdLikeToString(project.acceptedFreelancer)
    : "";
  return { ownerId, freelancerId };
}

/** @returns {true|false} false replaces `true`; sinon libellé d’erreur (string FR) */
function canParticipantsChat(project, senderId, receiverId) {
  if (!project) return "Projet introuvable";
  if (!project.acceptedFreelancer)
    return "Chat non autorisé";
  const s = senderId != null ? String(senderId).trim() : "";
  const r = receiverId != null ? String(receiverId).trim() : "";
  if (!s || !r) return "Données message invalides";

  const { ownerId, freelancerId } = projectParticipantIds(project);
  if (!freelancerId || !ownerId) return "Conversation invalide";

  const allowed =
    (s === ownerId && r === freelancerId) ||
    (s === freelancerId && r === ownerId);
  if (!allowed) return "Vous ne pouvez pas envoyer dans cette conversation";

  return true;
}

/** L’utilisateur est client ou freelance assigné sur ce projet. */
function isProjectParticipant(project, userId) {
  if (!project) return false;
  const u = userId != null ? String(userId).trim() : "";
  if (!u) return false;
  const { ownerId, freelancerId } = projectParticipantIds(project);
  return u === ownerId || u === freelancerId;
}

module.exports = {
  mongoIdLikeToString,
  projectParticipantIds,
  canParticipantsChat,
  isProjectParticipant,
};
