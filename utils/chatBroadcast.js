/** Serialize a Message document for Socket.IO + Flutter (plain string ids). */

function serializeMessage(doc) {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: String(o._id),
    projectId: o.projectId != null ? String(o.projectId) : null,
    senderId: o.senderId != null ? String(o.senderId) : null,
    receiverId: o.receiverId != null ? String(o.receiverId) : null,
    text: o.isDeleted ? "" : (o.text ?? ""),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    editedAt: o.editedAt ?? null,
    isDeleted: Boolean(o.isDeleted),
  };
}

function broadcastToParticipants(io, payload, event) {
  if (!io || !payload) return;
  const recv = payload.receiverId;
  const send = payload.senderId;
  if (recv) io.to(recv).emit(event, payload);
  if (send) io.to(send).emit(event, payload);
}

function broadcastSavedMessage(io, savedDoc) {
  if (!io || !savedDoc) return;
  broadcastToParticipants(io, serializeMessage(savedDoc), "receive_message");
}

function broadcastMessageUpdated(io, savedDoc) {
  if (!io || !savedDoc) return;
  broadcastToParticipants(io, serializeMessage(savedDoc), "message_updated");
}

function broadcastMessageDeleted(io, savedDoc) {
  if (!io || !savedDoc) return;
  broadcastToParticipants(io, serializeMessage(savedDoc), "message_deleted");
}

module.exports = {
  serializeMessage,
  broadcastSavedMessage,
  broadcastMessageUpdated,
  broadcastMessageDeleted,
};
