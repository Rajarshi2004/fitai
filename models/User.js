// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name:               { type: String, required: true },
  email:              { type: String, required: true, unique: true, lowercase: true },
  password_hash:      { type: String, required: true },
  age:                Number,
  height_cm:          Number,
  weight_kg:          Number,
  gender:             String,
  fitness_goal:       { type: String, default: "general_fitness" },
  experience_level:   { type: String, default: "beginner" },
  role:               { type: String, enum: ["USER","ADMIN"], default: "USER" },
  subscription_status:{ type: String, enum: ["trial","active","expired","lifetime"], default: "trial" },
  trial_end_date:     Date,
  subscription_start: Date,
  subscription_end:   Date,
  payment_id:         String,
  payment_provider:   String,
  reset_token:        String,
  reset_token_expiry: Date,
  last_insights:      Object,
  last_insights_at:   Date,
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
