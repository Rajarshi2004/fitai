// models/Payment.js
const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  order_id:   String,
  payment_id: String,
  amount_inr: Number,
  status:     { type: String, enum: ["created","paid","failed","refunded"], default: "created" },
  paid_at:    Date,
}, { timestamps: true });

module.exports = mongoose.models.Payment || mongoose.model("Payment", PaymentSchema);
