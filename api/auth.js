// api/auth.js
const express  = require("express");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");
const crypto   = require("crypto");
const User     = require("../models/User");
const router   = express.Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, age, height_cm, weight_kg,
            gender, fitness_goal, experience_level } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email, password required" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const hash     = await bcrypt.hash(password, 10);
    const isAdmin  = email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + Number(process.env.TRIAL_DAYS || 30));

    const user = await User.create({
      name, email: email.toLowerCase(),
      password_hash: hash,
      age, height_cm, weight_kg, gender,
      fitness_goal:     fitness_goal     || "general_fitness",
      experience_level: experience_level || "beginner",
      role:                isAdmin ? "ADMIN" : "USER",
      subscription_status: isAdmin ? "lifetime" : "trial",
      trial_end_date:      isAdmin ? null : trialEnd,
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    const { password_hash, ...safe } = user.toObject();
    res.status(201).json({ token, user: { ...safe, id: safe._id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    // Force admin if email matches
    const isAdmin = user.email === process.env.ADMIN_EMAIL?.toLowerCase();
    if (isAdmin && (user.role !== "ADMIN" || user.subscription_status !== "lifetime")) {
      user.role = "ADMIN";
      user.subscription_status = "lifetime";
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    const { password_hash, ...safe } = user.toObject();
    res.json({ token, user: { ...safe, id: safe._id } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: "Reset link sent" });

    const token  = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000);
    user.reset_token        = token;
    user.reset_token_expiry = expiry;
    await user.save();

    const resetLink = `${process.env.APP_URL}/api/auth/reset-password-page?token=${token}`;

    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;

    if (!SMTP_USER || SMTP_USER.includes("your_")) {
      console.log(`\n⚠️  SMTP not configured. Reset link:\n${resetLink}\n`);
      return res.json({ message: "Reset link sent" });
    }

    const nodemailer  = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || "smtp.gmail.com",
      port:   parseInt(process.env.SMTP_PORT || "465"),
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from:    `"FitAI" <${SMTP_USER}>`,
      to:      email,
      subject: "Reset your FitAI password",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d0d0d;color:#fff;padding:32px;border-radius:16px;">
          <h2 style="color:#B8FF00;margin-top:0;">FitAI Password Reset</h2>
          <p>Hi ${user.name},</p>
          <p>Click below to reset your password. Expires in 1 hour.</p>
          <a href="${resetLink}" style="display:inline-block;background:#B8FF00;color:#000;font-weight:800;padding:14px 28px;border-radius:10px;text-decoration:none;margin:16px 0;">
            Reset Password
          </a>
          <p style="color:#888;font-size:12px;">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: "Reset link sent to your email" });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Could not send email: " + err.message });
  }
});

// GET /api/auth/reset-password-page
router.get("/reset-password-page", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.send("<h2>Invalid link</h2>");

  const user = await User.findOne({
    reset_token: token,
    reset_token_expiry: { $gt: new Date() }
  });

  if (!user) {
    return res.send(`<div style="font-family:sans-serif;text-align:center;padding:60px;background:#0d0d0d;color:#fff;min-height:100vh;">
      <h2 style="color:#FF4444">❌ Link expired or invalid</h2>
      <p>Request a new reset link in the FitAI app.</p>
    </div>`);
  }

  const appUrl = process.env.APP_URL || "";
  res.send(`<div style="font-family:sans-serif;max-width:400px;margin:60px auto;background:#111;padding:32px;border-radius:16px;color:#fff;">
    <h2 style="color:#B8FF00">Set New Password</h2>
    <form method="POST" action="${appUrl}/api/auth/reset-password">
      <input type="hidden" name="token" value="${token}" />
      <input type="password" name="newPassword" placeholder="New password (min 6 chars)" required minlength="6"
        style="width:100%;padding:14px;border-radius:10px;border:1.5px solid #333;background:#1a1a1a;color:#fff;font-size:15px;box-sizing:border-box;margin-bottom:16px;" />
      <button type="submit" style="width:100%;background:#B8FF00;color:#000;font-weight:800;font-size:16px;padding:14px;border:none;border-radius:10px;cursor:pointer;">
        Reset Password
      </button>
    </form>
  </div>`);
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ error: "Token and new password required" });
    if (newPassword.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    const user = await User.findOne({
      reset_token: token,
      reset_token_expiry: { $gt: new Date() }
    });

    if (!user) {
      const acceptsHtml = req.headers.accept?.includes("text/html");
      if (acceptsHtml) return res.send(`<div style="font-family:sans-serif;text-align:center;padding:60px;background:#0d0d0d;color:#fff;min-height:100vh;">
        <h2 style="color:#FF4444">❌ Link expired</h2><p>Request a new reset link in the FitAI app.</p>
      </div>`);
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    user.password_hash      = await bcrypt.hash(newPassword, 10);
    user.reset_token        = null;
    user.reset_token_expiry = null;
    await user.save();

    const acceptsHtml = req.headers.accept?.includes("text/html");
    if (acceptsHtml) {
      return res.send(`<div style="font-family:sans-serif;text-align:center;padding:60px;background:#0d0d0d;color:#fff;min-height:100vh;">
        <h2 style="color:#B8FF00">✅ Password Reset!</h2>
        <p>Your password has been updated. Open FitAI app and sign in.</p>
      </div>`);
    }
    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Reset failed" });
  }
});

module.exports = router;
