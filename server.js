const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const crypto = require("crypto");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// =======================
// MODELS
// =======================
const User = require("./models/User");
const Doctor = require("./models/Doctor");
const Appointment = require("./models/Appointment");

// =======================
// ✅ MONGOOSE FIX (LATEST)
// =======================
mongoose.set("returnDocument", "after");

// =======================
// DATABASE
// =======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log(err));

// =======================
// EMAIL SETUP
// =======================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) console.log("❌ Email error:", error);
  else console.log("✅ Email transporter ready!");
});

// =======================
// EMAIL FUNCTION
// =======================
const sendAppointmentEmail = async (
  toEmail,
  patientName,
  doctorName,
  date,
  time,
  fees,
  status
) => {
  await transporter.sendMail({
    from: `"MUSKAN Healthcare 🌸" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Appointment ${status}`,
    html: `
      <h2>Appointment ${status}</h2>
      <p>Hello ${patientName}</p>
      <p>Doctor: ${doctorName}</p>
      <p>Date: ${date}</p>
      <p>Time: ${time}</p>
      <p>Fees: ₹${fees}</p>
    `,
  });
};

// =======================
// RAZORPAY SETUP
// =======================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// =======================
// MIDDLEWARE
// =======================
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ message: "Access denied" });
  next();
};

// =======================
// AUTH ROUTES
// =======================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({ name, email, password: hashed, role });
    await user.save();

    if (role === "doctor") {
      await new Doctor({ userId: user._id }).save();
    }

    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// BOOK APPOINTMENT + CREATE ORDER
// =======================
app.post("/api/appointments", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const { doctorId, date, time } = req.body;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    const order = await razorpay.orders.create({
      amount: doctor.fees * 100,
      currency: "INR",
    });

    const appointment = new Appointment({
      doctorId,
      patientId: req.user.id,
      date,
      time,
      status: "pending",
      orderId: order.id,
    });

    await appointment.save();

    res.json({
      appointmentId: appointment._id,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PAYMENT VERIFY + CONFIRM
// =======================
app.post("/api/payment/verify", authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appointmentId,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: "Payment failed" });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      {
        status: "confirmed",
        isPaid: true,
        paymentId: razorpay_payment_id,
      },
      { returnDocument: "after" }
    )
      .populate("patientId", "name email")
      .populate("doctorId");

    const doctorUser = await User.findById(appointment.doctorId.userId);

    await sendAppointmentEmail(
      appointment.patientId.email,
      appointment.patientId.name,
      doctorUser.name,
      appointment.date,
      appointment.time,
      appointment.doctorId.fees,
      "confirmed"
    );

    res.json({ message: "Payment successful", appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});