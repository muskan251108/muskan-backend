const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// ================= MODELS =================
const User = require("./models/User");
const Doctor = require("./models/Doctor");
const Appointment = require("./models/Appointment");

// ================= DATABASE =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log(err));

// ================= EMAIL =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) console.log("❌ Email error:", err);
  else console.log("✅ Email ready");
});

// ================= EMAIL FUNCTION =================
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
    from: `"MUSKAN Healthcare" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Appointment ${status}`,
    html: `
      <h2>Appointment ${status}</h2>
      <p>${patientName}</p>
      <p>Doctor: ${doctorName}</p>
      <p>Date: ${date}</p>
      <p>Time: ${time}</p>
      <p>Fees: ₹${fees}</p>
    `,
  });
};

// ================= AUTH =================

// REGISTER
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

// LOGIN ✅ FIXED
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("LOGIN:", email);

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    console.log("LOGIN SUCCESS");

    res.json({ token });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= MIDDLEWARE =================
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

// ================= DOCTOR UPDATE =================
app.put("/api/doctor/profile", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const doctor = await Doctor.findOneAndUpdate(
      { userId: req.user.id },
      req.body,
      { returnDocument: "after" }
    );

    res.json(doctor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= APPOINTMENT UPDATE =================
app.put("/api/appointments/:id/status", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { returnDocument: "after" }
    )
      .populate("patientId", "name email")
      .populate("doctorId");

    if (!appointment) return res.status(404).json({ message: "Not found" });

    const doctorUser = await User.findById(appointment.doctorId.userId);

    await sendAppointmentEmail(
      appointment.patientId.email,
      appointment.patientId.name,
      doctorUser.name,
      appointment.date,
      appointment.time,
      appointment.doctorId.fees,
      req.body.status
    );

    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SERVER =================
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});