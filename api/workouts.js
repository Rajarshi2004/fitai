// api/workouts.js
const express = require("express");
const Workout = require("../models/Workout");
const { verifyToken } = require("../middleware/auth");
const router  = express.Router();

router.use(verifyToken);

// POST /api/workouts — log a workout
router.post("/", async (req, res) => {
  try {
    const { name, duration_minutes, calories, sets, notes } = req.body;
    const workout = await Workout.create({
      user_id: req.user._id,
      name, duration_minutes, calories, sets, notes,
      started_at: new Date(),
    });
    res.status(201).json(workout);
  } catch (err) {
    res.status(500).json({ error: "Failed to log workout" });
  }
});

// GET /api/workouts — get user's workouts
router.get("/", async (req, res) => {
  try {
    const workouts = await Workout.find({ user_id: req.user._id })
      .sort({ started_at: -1 }).limit(50);
    res.json(workouts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workouts" });
  }
});

module.exports = router;
