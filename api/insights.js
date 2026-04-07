// api/insights.js
const express = require("express");
const Workout = require("../models/Workout");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const router = express.Router();

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

    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const workouts = await Workout.find({ user_id: user._id, started_at: { $gte: monday } })
      .sort({ started_at: -1 }).limit(10);

    const historyText = workouts.length
      ? workouts.map(w =>
        `- ${w.name}: ${w.duration_minutes}m, ${w.calories}kcal, ${ (w.sets || []).slice(0, 3).map(s => `${s.exercise} ${s.weight_kg}kgx${s.reps}`).join(", ") }`
      ).join("\n")
      : "No workouts logged yet this week.";

    const prompt = `Goal: ${user.fitness_goal}. History:\n${historyText}\n\nRespond ONLY with this JSON structure, no markdown:\n{\n  "weekSummary": "Summary",\n  "insights": [\n    {"icon":"💪","title":"T","body":"B","tag":"S","type":"positive"}\n  ],\n  "weightSuggestion": {"exercise":"E","current":"C","suggested":"S","reason":"R"}\n}`;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({ weekSummary: "⚠️ KEY MISSING IN VERCEL" });
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) return res.status(200).json({ weekSummary: "⚠️ AI ERROR: " + geminiData.error.message });

    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    try {
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start !== -1 && end !== -1) rawText = rawText.substring(start, end + 1);
      
      const parsed = JSON.parse(rawText);
      await User.findByIdAndUpdate(user._id, { last_insights: parsed, last_insights_at: new Date() });
      res.json(parsed);
    } catch (e) {
      res.status(200).json({ 
        weekSummary: "⚠️ JSON Parsing Issue.",
        insights: [], 
        weightSuggestion: { exercise: "Raw Response Received", current: "-", suggested: "-", reason: rawText.substring(0, 200) }
      });
    }
  } catch (err) {
    res.status(200).json({ weekSummary: "⚠️ ERROR: " + err.message });
  }
});

module.exports = router;
