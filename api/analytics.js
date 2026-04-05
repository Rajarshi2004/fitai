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
    // Align with frontend chart (Mon-Sun). Reset occurs immediately after Sunday ends (Monday 00:00)
    const day = since.getDay(); 
    const diff = since.getDate() - day + (day === 0 ? -6 : 1);
    since.setDate(diff);
    since.setHours(0,0,0,0);

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
    const thisWeek = new Date();
    const day = thisWeek.getDay(), diff = thisWeek.getDate() - day + (day === 0 ? -6 : 1);
    thisWeek.setDate(diff);
    thisWeek.setHours(0,0,0,0);
    const thisWeekStartMs = thisWeek.getTime();

    // Start exactly 5 weeks before this current calendar week
    const since = new Date(thisWeekStartMs);
    since.setDate(since.getDate() - 35);

    const workouts = await Workout.find({
      user_id: req.user._id,
      started_at: { $gte: since }
    }).sort({ started_at: 1 });

    const weekWorkouts = workouts.filter(w => new Date(w.started_at) >= thisWeekStartMs);

    const stats = {
      workouts:   weekWorkouts.length,
      calories:   weekWorkouts.reduce((s,w) => s + (w.calories||0), 0),
      volume:     Math.round(weekWorkouts.reduce((s,w) =>
        s + (w.sets||[]).reduce((ss,set) => ss + ((set.weight_kg||0)*(set.reps||0)*(set.sets||1)),0),0)),
      avgPerWeek: workouts.length > 0 ? Math.round(workouts.length / 6) : 0,
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
    const muscles = ["Chest","Back","Legs","Shoulders","Arms","Core"];
    const balance = muscles.map(m => ({
      muscle: m,
      pct: muscleCount[m] ? Math.round((muscleCount[m]/total)*100) : 0
    }));

    // Generate Frequency Graph and Strength Curve Graphs over the 6 weeks
    const weeksData = [0,0,0,0,0,0];
    const msInWeek = 7 * 24 * 60 * 60 * 1000;
    
    const strengthData = {};
    muscles.forEach(m => strengthData[m] = [[],[],[],[],[],[]]); 

    workouts.forEach(w => {
        const workoutMs = new Date(w.started_at).getTime();
        let idx;
        if (workoutMs >= thisWeekStartMs) {
            idx = 5; // "This"
        } else {
            const weeksBefore = Math.floor((thisWeekStartMs - workoutMs - 1) / msInWeek) + 1;
            idx = 5 - weeksBefore; 
        }

        if (idx >= 0 && idx <= 5) {
           weeksData[idx]++;
           
           (w.sets||[]).forEach(s => {
               if (s.exercise && s.weight_kg) {
                   const m = detectMuscle(s.exercise);
                   if (strengthData[m]) {
                       strengthData[m][idx].push(s.weight_kg);
                   }
               }
           });
        }
    });

    const frequency = {
        labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "This"],
        datasets: [{ data: weeksData }]
    };

    const strengthCurve = {};
    muscles.forEach(m => {
        strengthCurve[m] = {
            labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "This"],
            datasets: [{ data: strengthData[m].map(weekWeights => 
                weekWeights.length === 0 ? 0 : Math.round(Math.max(...weekWeights))
            ) }]
        };
    });

    res.json({ stats, balance, frequency, strengthCurve });
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
