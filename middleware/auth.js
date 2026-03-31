// middleware/auth.js
const jwt  = require("jsonwebtoken");
const User = require("../models/User");

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password_hash");
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "ADMIN")
    return res.status(403).json({ error: "Admin access required" });
  next();
};

const requirePremium = (req, res, next) => {
  const u = req.user;
  if (u.role === "ADMIN" || u.subscription_status === "lifetime") return next();
  if (u.subscription_status === "active") {
    if (!u.subscription_end || new Date(u.subscription_end) > new Date()) return next();
    return res.status(403).json({ error: "subscription_expired" });
  }
  if (u.subscription_status === "trial") {
    if (!u.trial_end_date || new Date(u.trial_end_date) > new Date()) return next();
    return res.status(403).json({ error: "trial_expired" });
  }
  return res.status(403).json({ error: "subscription_required" });
};

module.exports = { verifyToken, requireAdmin, requirePremium };
