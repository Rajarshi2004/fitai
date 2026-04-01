// api/insights.js
const express = require("express");
const Workout = require("../models/Workout");
const { verifyToken } = require("../middleware/auth");
const router = express.Router();

router.use(verifyToken);

// POST /api/insights/generate
router.post("/generate", async (req, res) => {
  try {
    const user = req.user;

    // Get recent workout history
    const since = new Date();
    since.setDate(since.getDate() - 21);
    const workouts = await Workout.find({ user_id: user._id, started_at: { $gte: since } })
      .sort({ started_at: -1 }).limit(20);

    const historyText = workouts.length
      ? workouts.map(w =>
        `- ${w.name || "Workout"} (${new Date(w.started_at).toDateString()}): ` +
        `${w.duration_minutes || 0}min, ${w.calories || 0}kcal, ` +
        (w.sets || []).slice(0, 3).map(s => `${s.exercise} ${s.weight_kg}kg×${s.reps}`).join(", ")
      ).join("\n")
      : "No recent workout data — give general advice based on profile.";

    const prompt = `Athlete profile:
Name: ${user.name}, Age: ${user.age || 25}, Weight: ${user.weight_kg || 75}kg
Goal: ${user.fitness_goal || "general_fitness"}, Level: ${user.experience_level || "intermediate"}

Recent workouts (last 3 weeks):
${historyText}

Respond ONLY with this exact JSON, no extra text or markdown:
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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) return res.status(502).json({ error: geminiData.error.message });

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean.slice(clean.indexOf("{")));

    res.json(parsed);
  } catch (err) {
    console.error("Insights error:", err.message);
    res.status(500).json({ error: "Failed to generate insights: " + err.message });
  }
});

module.exports = router;
