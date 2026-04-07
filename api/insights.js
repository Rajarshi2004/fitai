// api/insights.js
const express = require("express");
const Workout = require("../models/Workout");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const router = express.Router();

// GET /api/insights/debug-env (Public for debugging)
router.get("/debug-env", (req, res) => {
  res.json({
    GEMINI_API_KEY_EXISTS: !!process.env.GEMINI_API_KEY,
    GEMINI_API_KEY_PREFIX: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 6) + "..." : "NONE",
    GEMINI_MODEL: process.env.GEMINI_MODEL || "NOT_SET",
    NODE_ENV: process.env.NODE_ENV
  });
});

router.use(verifyToken);

// GET /api/insights/
router.get("/", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user?.last_insights || null);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch insights" });
  }
});

// POST /api/insights/generate
router.post("/generate", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 1. Calculate Monday start
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    // 2. Cache Logic
    const lastAt = user.last_insights_at || new Date(0);
    if (user.last_insights && lastAt >= monday) {
      const newWorkoutsCount = await Workout.countDocuments({
        user_id: user._id,
        started_at: { $gt: lastAt }
      });
      if (newWorkoutsCount === 0) return res.json(user.last_insights);
    }

    const workouts = await Workout.find({ user_id: user._id, started_at: { $gte: monday } })
      .sort({ started_at: -1 }).limit(10);

    const historyText = workouts.length
      ? workouts.map(w =>
        `- ${w.name}: ${w.duration_minutes}min, ${w.calories}kcal, ` +
        (w.sets || []).slice(0, 2).map(s => `${s.exercise} ${s.weight_kg}kg×${s.reps}`).join(", ")
      ).join("\n")
      : "No workoutslogged yet this week.";

    const prompt = `Profile: ${user.name}, Age: ${user.age}, Goal: ${user.fitness_goal}.
Week history:
${historyText}

Respond ONLY with this JSON:
{
  "weekSummary": "Summary",
  "insights": [{"icon":"💪","title":"T","body":"B","tag":"S","type":"positive"}],
  "weightSuggestion": {"exercise":"E","current":"C","suggested":"S","reason":"R"}
}`;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({ weekSummary: "⚠️ ERROR: GEMINI_API_KEY NOT CONFIGURED ON VERCEL" });
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    try {
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
      if (geminiData.error) {
        return res.status(200).json({ weekSummary: `⚠️ AI ERROR: ${geminiData.error.message}` });
      }

      let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Robust JSON extraction
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start !== -1 && end !== -1) rawText = rawText.substring(start, end + 1);

      const parsed = JSON.parse(rawText);
      await User.findByIdAndUpdate(user._id, { last_insights: parsed, last_insights_at: new Date() });
      res.json(parsed);
    } catch (apiErr) {
      res.status(200).json({ weekSummary: `⚠️ BACKEND JSON ERROR: ${apiErr.message}. RAW: ${geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 50)}` });
    }
  } catch (err) {
    res.status(200).json({ weekSummary: `⚠️ FATAL ERROR: ${err.message}` });
  }
});

module.exports = router;
