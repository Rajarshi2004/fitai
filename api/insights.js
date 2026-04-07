// api/insights.js
const express = require("express");
const Workout = require("../models/Workout");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const router = express.Router();

router.use(verifyToken);

// POST /api/insights/generate
router.post("/generate", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 1. Calculate start of current week (Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    // 2. Cache Logic: Return existing insights if no new workouts this week
    const lastAt = user.last_insights_at || new Date(0);
    if (user.last_insights && lastAt >= monday) {
      const newWorkoutsCount = await Workout.countDocuments({
        user_id: user._id,
        started_at: { $gt: lastAt }
      });
      if (newWorkoutsCount === 0) {
        return res.json(user.last_insights);
      }
    }

    // 3. Collect Data (Current week only)
    const workouts = await Workout.find({ user_id: user._id, started_at: { $gte: monday } })
      .sort({ started_at: -1 }).limit(15);

    const historyText = workouts.length
      ? workouts.map(w =>
        `- ${w.name || "Workout"} (${new Date(w.started_at).toDateString()}): ` +
        `${w.duration_minutes || 0}min, ${w.calories || 0}kcal, ` +
        (w.sets || []).slice(0, 3).map(s => `${s.exercise} ${s.weight_kg}kg×${s.reps}`).join(", ")
      ).join("\n")
      : "No workouts logged yet this week — give general advice based on profile.";

    const prompt = `Athlete profile:
Name: ${user.name}, Age: ${user.age || 25}, Weight: ${user.weight_kg || 75}kg
Goal: ${user.fitness_goal || "general_fitness"}, Level: ${user.experience_level || "intermediate"}

Current Week's history:
${historyText}

Respond ONLY with this exact JSON, no extra text:
{
  "weekSummary": "2-3 sentence coaching summary",
  "insights": [
    {"icon":"💪","title":"Short title","body":"2 sentences of advice.","tag":"Strength","type":"positive"},
    {"icon":"🍽️","title":"Short title","body":"2 sentences of advice.","tag":"Nutrition","type":"info"},
    {"icon":"😴","title":"Short title","body":"2 sentences of advice.","tag":"Recovery","type":"warning"}
  ],
  "weightSuggestion": {
    "exercise": "Best exercise to progress",
    "current": "current weight x reps",
    "suggested": "suggested weight x reps",
    "reason": "One sentence reason."
  }
}`;

    // 4. API Key Check
    if (!process.env.GEMINI_API_KEY) {
      console.error("DEBUG: GEMINI_API_KEY is null or undefined");
      return res.status(500).json({ error: "BACKEND_ERROR: GEMINI_API_KEY is NOT set in Vercel environment variables." });
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024, responseMimeType: "application/json" },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) return res.status(502).json({ error: "AI Service Error: " + geminiData.error.message });

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawText.trim());

    // 5. Save for persistence
    await User.findByIdAndUpdate(user._id, {
      last_insights: parsed,
      last_insights_at: new Date()
    });

    res.json(parsed);
  } catch (err) {
    console.error("Insights error:", err.message);
    res.status(500).json({ error: "Failed to generate insights: " + err.message });
  }
});

module.exports = router;
