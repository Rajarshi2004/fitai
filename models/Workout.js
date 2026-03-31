// models/Workout.js
const mongoose = require("mongoose");

const SetSchema = new mongoose.Schema({
  exercise:  String,
  weight_kg: Number,
  reps:      Number,
  sets:      Number,
});

const WorkoutSchema = new mongoose.Schema({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name:       String,
  duration_minutes: Number,
  calories:   Number,
  notes:      String,
  sets:       [SetSchema],
  started_at: { type: Date, default: Date.now },
  ended_at:   Date,
}, { timestamps: true });

module.exports = mongoose.models.Workout || mongoose.model("Workout", WorkoutSchema);
