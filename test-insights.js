const axios = require('axios');

async function test() {
  try {
    console.log("1. Registering dummy user...");
    const email = `test_${Date.now()}@test.com`;
    const regRes = await axios.post("https://fitai-six.vercel.app/api/auth/register", {
      name: "Test User",
      email: email,
      password: "password123"
    });
    
    const token = regRes.data.token;
    console.log("✅ Registered. Token received.");
    
    console.log("2. Requesting AI Insights (this may take a while)...");
    const startTime = Date.now();
    const insRes = await axios.post("https://fitai-six.vercel.app/api/insights/generate", {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60000 // 60 seconds
    });
    
    console.log(`✅ Success in ${(Date.now()-startTime)/1000}s. Data:`);
    console.log(JSON.stringify(insRes.data, null, 2));
    
  } catch (err) {
    if (err.response) {
      console.error(`❌ HTTP ${err.response.status}:`, err.response.data);
    } else {
      console.error("❌ Error:", err.message);
    }
  }
}

test();
