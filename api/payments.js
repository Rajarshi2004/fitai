// api/payments.js
const express   = require("express");
const Razorpay  = require("razorpay");
const crypto    = require("crypto");
const User      = require("../models/User");
const Payment   = require("../models/Payment");
const { verifyToken } = require("../middleware/auth");
const router    = express.Router();

function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || key_id.includes("your_"))
    throw new Error("Razorpay keys not configured");
  return new Razorpay({ key_id, key_secret });
}

// GET /api/payments/checkout-page
router.get("/checkout-page", async (req, res) => {
  try {
    let userId, userName, userEmail;
    const token = req.query.token || req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        const jwt  = require("jsonwebtoken");
        const dec  = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(dec.id);
        if (user) { userId = user._id; userName = user.name; userEmail = user.email; }
      } catch {}
    }

    const razorpay = getRazorpay();
    const amount   = Number(process.env.SUBSCRIPTION_PRICE_INR || 50) * 100;
    const order    = await razorpay.orders.create({
      amount, currency: "INR",
      receipt: `fitai_${userId||"guest"}_${Date.now()}`,
    });

    const key_id     = process.env.RAZORPAY_KEY_ID;
    const callbackUrl = `${process.env.APP_URL}/api/payments/web-verify`;

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>FitAI Pro — ₹50/month</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#080808;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
    .card{background:#111;border-radius:20px;padding:32px;max-width:400px;width:100%;text-align:center}
    h1{color:#B8FF00;font-size:28px;margin-bottom:8px}
    p{color:#888;font-size:14px;margin-bottom:24px}
    .price{font-size:42px;font-weight:900;color:#B8FF00;margin:16px 0 4px}
    .period{color:#888;font-size:14px;margin-bottom:32px}
    button{background:#B8FF00;color:#000;border:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;width:100%}
    #loader{display:none;color:#B8FF00;margin-top:16px}
  </style>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
  <div class="card">
    <h1>FitAI Pro</h1>
    <p>Unlimited AI coaching, advanced analytics & more</p>
    <div class="price">₹50</div>
    <div class="period">per month</div>
    <button onclick="startPayment()">Pay Now →</button>
    <div id="loader">Processing...</div>
  </div>
  <script>
    function startPayment() {
      document.querySelector("button").style.display="none";
      document.getElementById("loader").style.display="block";
      var options = {
        key: "${key_id}",
        amount: ${order.amount},
        currency: "INR",
        name: "FitAI",
        description: "Pro Subscription — 1 Month",
        order_id: "${order.id}",
        prefill: { name: "${userName||""}", email: "${userEmail||""}" },
        theme: { color: "#B8FF00" },
        handler: function(response) {
          fetch("${callbackUrl}", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              userId: "${userId||""}"
            })
          }).then(r=>r.json()).then(data => {
            if (data.success) {
              document.querySelector(".card").innerHTML = '<h1 style="color:#B8FF00;margin-bottom:16px">✅ Payment Successful!</h1><p>FitAI Pro is now active.<br><br>Go back to the app and refresh your profile.</p>';
            }
          });
        },
        modal: { ondismiss: function() {
          document.querySelector("button").style.display="block";
          document.getElementById("loader").style.display="none";
        }}
      };
      new Razorpay(options).open();
    }
    window.onload = function() { setTimeout(startPayment, 500); };
  </script>
</body>
</html>`);
  } catch (err) {
    const errMsg = err.message || (err.error && err.error.description) || JSON.stringify(err);
    res.status(500).send(`<h2 style="color:red;font-family:sans-serif;padding:40px">Payment Error: ${errMsg}</h2>`);
  }
});

// POST /api/payments/web-verify
router.post("/web-verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, error: "Signature mismatch" });

    const subEnd = new Date();
    subEnd.setMonth(subEnd.getMonth() + 1);

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        subscription_status: "active",
        subscription_start:  new Date(),
        subscription_end:    subEnd,
        payment_id:          razorpay_payment_id,
        payment_provider:    "razorpay",
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
