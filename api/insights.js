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

    // 1. Current Week (Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    // 2. Fetch data
    const workouts = await Workout.find({ user_id: user._id, started_at: { $gte: monday } })
      .sort({ started_at: -1 }).limit(10);

    const historyText = workouts.map(w =>
      `${w.name}: ${w.duration_minutes}m, ${w.calories}kcal, ${ (w.sets || []).map(s => `${s.exercise} ${s.weight_kg}kgx${s.reps}`).join(", ") }`
    ).join("\n");

    // 3. Simple Prompt
    const prompt = `User Goal: ${user.fitness_goal}. History this week:\n${historyText}\n\nProvide coaching in JSON format. 
Focus on 1 major next step (increase weight/add protein). 
Return ONLY this JSON structure, NO markdown:
{
  "weekSummary": "1-2 sentence overview",
  "insights": [
    {"icon":"💪","title":"Training Tip","body":"Brief advice","tag":"Strength","type":"positive"},
    {"icon":"🥗","title":"Nutrition Tip","body":"Brief advice","tag":"Diet","type":"info"}
  ],
  "weightSuggestion": {
    "exercise": "Main exercise",
    "current": "current set",
    "suggested": "target set",
    "reason": "Why?"
  }
}`;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({ weekSummary: "⚠️ Set GEMINI_API_KEY in Vercel" });
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash"; // Using 1.5-flash for maximum JSON stability
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500, responseMimeType: "application/json" },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) return res.status(200).json({ weekSummary: "⚠️ AI Error: " + geminiData.error.message });

    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Robust parsing
    try {
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start !== -1 && end !== -1) rawText = rawText.substring(start, end + 1);
      
      const parsed = JSON.parse(rawText);
      await User.findByIdAndUpdate(user._id, { last_insights: parsed, last_insights_at: new Date() });
      res.json(parsed);
    } catch (e) {
      res.status(200).json({ weekSummary: "⚠️ JSON Parsing Error. Try again in 5 seconds." });
    }
  } catch (err) {
    res.status(200).json({ weekSummary: "⚠️ System Error: " + err.message });
  }
});

module.exports = router;
