// api/users.js
const express = require("express");
const User    = require("../models/User");
const Workout = require("../models/Workout");
const { verifyToken } = require("../middleware/auth");
const router  = express.Router();

router.use(verifyToken);

// GET /api/users/me
router.get("/me", (req, res) => {
  const { password_hash, ...safe } = req.user.toObject();
  res.json({ ...safe, id: safe._id });
});

// PUT /api/users/me
router.put("/me", async (req, res) => {
  try {
    const { name, age, height_cm, weight_kg, gender, fitness_goal, experience_level } = req.body;
    const update = {};
    if (name             != null) update.name             = name;
    if (age              != null) update.age              = age;
    if (height_cm        != null) update.height_cm        = height_cm;
    if (weight_kg        != null) update.weight_kg        = weight_kg;
    if (gender           != null) update.gender           = gender;
    if (fitness_goal     != null) update.fitness_goal     = fitness_goal;
    if (experience_level != null) update.experience_level = experience_level;

    const updated = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("-password_hash");
    res.json({ ...updated.toObject(), id: updated._id });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /api/users/me
router.delete("/me", async (req, res) => {
  try {
    await Workout.deleteMany({ user_id: req.user._id });
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
