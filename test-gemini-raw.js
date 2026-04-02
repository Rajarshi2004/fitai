require("dotenv").config({ path: require('path').resolve(__dirname, '.env') });

async function rawGeminiTest() {
  const prompt = `Athlete profile:
Name: Test User, Age: 25, Weight: 75kg
Goal: general_fitness, Level: intermediate

Recent workouts (last 3 weeks):
No recent workout data — give general advice based on profile.

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

  console.log("Calling Gemini API with GEMINI_MODEL=gemini-2.5-flash...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: "application/json" }
      })
    }
  );

  const data = await res.json();
  if (data.error) {
    console.log("Gemini Error:", data.error.message);
    return;
  }
  
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("=== RAW TEXT RECEIVED ===");
  console.log(rawText);
  console.log("=========================");
  console.log("\\nAttempting to parse JSON...");
  try {
    const parsed = JSON.parse(rawText.trim());
    console.log("✅ JSON parsed successfully!");
  } catch (err) {
    console.log("❌ JSON parse failed:", err.message);
    console.log("Ah, the payload length is:", rawText.length, "characters.");
  }
}

rawGeminiTest();
