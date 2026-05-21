const User = require("../models/User");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/** Resolve user from route param (encoded email, case-insensitive). */
async function findUserByEmailParam(emailParam) {
  const emailNorm = normalizeEmail(
    decodeURIComponent(String(emailParam || ""))
  );
  if (!emailNorm) return null;

  let user = await User.findOne({ email: emailNorm });
  if (user) return user;

  const esc = emailNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return User.findOne({
    email: { $regex: new RegExp("^" + esc + "$", "i") },
  });
}

module.exports = { normalizeEmail, findUserByEmailParam };
