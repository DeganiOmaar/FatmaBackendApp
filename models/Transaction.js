const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  from: String,
  to: String,
  amount: Number,
  type: String // escrow | release
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);