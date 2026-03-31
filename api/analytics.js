// api/analytics.js
const express = require("express");
const Workout = require("../models/Workout");
const { verifyToken } = require("../middleware/auth");
const router  = express.Router();

router.use(verifyToken);

// GET /api/analytics/weekly
router.get("/weekly", async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const workouts = await Workout.find({
      user_id: req.user._id,
      started_at: { $gte: since }
    });

    const weeklyWorkouts = workouts.length;
    const weeklyCalories = workouts.reduce((s, w) => s + (w.calories || 0), 0);
    const weeklyVolume   = workouts.reduce((s, w) =>
      s + (w.sets || []).reduce((ss, set) => ss + ((set.weight_kg || 0) * (set.reps || 0) * (set.sets || 1)), 0), 0
    );

    // Calories per day of week
    const calories = [0,0,0,0,0,0,0];
    workouts.forEach(w => {
      const day = new Date(w.started_at).getDay();
      const idx = day === 0 ? 6 : day - 1; // Mon=0
      calories[idx] += (w.calories || 0);
    });

    res.json({ weeklyWorkouts, weeklyCalories, weeklyVolume: Math.round(weeklyVolume), calories });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// GET /api/analytics/full
router.get("/full", async (req, res) => {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);

    const workouts = await Workout.find({
      user_id: req.user._id,
      started_at: { $gte: since }
    }).sort({ started_at: 1 });

    const thisMonth = new Date();
    thisMonth.setDate(1);
    const monthWorkouts = workouts.filter(w => new Date(w.started_at) >= thisMonth);

    const stats = {
      workouts:   monthWorkouts.length,
      calories:   monthWorkouts.reduce((s,w) => s + (w.calories||0), 0),
      volume:     Math.round(monthWorkouts.reduce((s,w) =>
        s + (w.sets||[]).reduce((ss,set) => ss + ((set.weight_kg||0)*(set.reps||0)*(set.sets||1)),0),0)),
      avgPerWeek: monthWorkouts.length > 0 ? Math.round(monthWorkouts.length / 4) : 0,
    };

    // Muscle balance from sets
    const muscleCount = {};
    workouts.forEach(w => {
      (w.sets||[]).forEach(s => {
        if (s.exercise) {
          const m = detectMuscle(s.exercise);
          muscleCount[m] = (muscleCount[m]||0) + 1;
        }
      });
    });
    const total = Object.values(muscleCount).reduce((a,b)=>a+b,1);
    const balance = ["Chest","Back","Legs","Shoulders","Arms","Core"].map(m => ({
      muscle: m,
      pct: muscleCount[m] ? Math.round((muscleCount[m]/total)*100) : 0
    }));

    res.json({ stats, balance });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

function detectMuscle(exercise) {
  const e = exercise.toLowerCase();
  if (e.includes("bench")||e.includes("chest")||e.includes("fly")) return "Chest";
  if (e.includes("row")||e.includes("pull")||e.includes("lat")||e.includes("back")) return "Back";
  if (e.includes("squat")||e.includes("leg")||e.includes("lunge")||e.includes("calf")) return "Legs";
  if (e.includes("shoulder")||e.includes("press")||e.includes("delt")||e.includes("shrug")) return "Shoulders";
  if (e.includes("curl")||e.includes("tricep")||e.includes("bicep")||e.includes("arm")) return "Arms";
  return "Core";
}

module.exports = router;
