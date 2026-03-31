// api/admin.js
const express = require("express");
const User    = require("../models/User");
const Workout = require("../models/Workout");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const router  = express.Router();

router.use(verifyToken, requireAdmin);

// GET /api/admin/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const [total, active, trial, expired, lifetime] = await Promise.all([
      User.countDocuments({ role: "USER" }),
      User.countDocuments({ role: "USER", subscription_status: "active" }),
      User.countDocuments({ role: "USER", subscription_status: "trial" }),
      User.countDocuments({ role: "USER", subscription_status: "expired" }),
      User.countDocuments({ role: "USER", subscription_status: "lifetime" }),
    ]);

    res.json({
      total_users:        total,
      active_subscribers: active,
      trial_users:        trial,
      expired_users:      expired,
      monthly_revenue:    active * Number(process.env.SUBSCRIPTION_PRICE_INR || 50),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({ role: "USER" })
      .select("-password_hash")
      .sort({ createdAt: -1 });

    const usersWithWorkouts = await Promise.all(
      users.map(async (u) => {
        const total_workouts = await Workout.countDocuments({ user_id: u._id });
        return { ...u.toObject(), id: u._id, total_workouts };
      })
    );

    res.json(usersWithWorkouts);
  } catch (err) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// PATCH /api/admin/users/:id
router.patch("/users/:id", async (req, res) => {
  try {
    const { action, days } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (action === "grant") {
      const end = new Date();
      end.setMonth(end.getMonth() + 1);
      user.subscription_status = "active";
      user.subscription_end    = end;
    } else if (action === "extend_trial") {
      const current = user.trial_end_date || new Date();
      user.trial_end_date = new Date(current.getTime() + (days||7) * 86400000);
    } else if (action === "disable") {
      user.subscription_status = "expired";
    }

    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Action failed" });
  }
});

module.exports = router;
