/** Serialize a Message document for Socket.IO + Flutter (plain string ids). */

function serializeMessage(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: String(o._id),
    projectId: o.projectId != null ? String(o.projectId) : null,
    senderId: o.senderId != null ? String(o.senderId) : null,
    receiverId: o.receiverId != null ? String(o.receiverId) : null,
    text: o.text ?? "",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function broadcastSavedMessage(io, savedDoc) {
  if (!io || !savedDoc) return;
  const payload = serializeMessage(savedDoc);
  const recv = payload.receiverId;
  const send = payload.senderId;
  /** Utilisateur uniquement — évite le double envoi si le client est aussi dans `project_chat:${id}` */
  if (recv) io.to(recv).emit("receive_message", payload);
  if (send) io.to(send).emit("receive_message", payload);
}

module.exports = { serializeMessage, broadcastSavedMessage };
