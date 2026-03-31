// server.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express  = require("express");
const cors     = require("cors");
const connectDB = require("./lib/db");

// Connect to MongoDB
connectDB();

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth",      require("./api/auth"));
app.use("/api/users",     require("./api/users"));
app.use("/api/workouts",  require("./api/workouts"));
app.use("/api/analytics", require("./api/analytics"));
app.use("/api/insights",  require("./api/insights"));
app.use("/api/payments",  require("./api/payments"));
app.use("/api/admin",     require("./api/admin"));

// Health check — also used by cron-job.org to keep server awake
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// 404
app.use((req, res) =>
  res.status(404).json({ error: "Route not found" })
);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 FitAI API → http://localhost:${PORT}`);
});

module.exports = app;
