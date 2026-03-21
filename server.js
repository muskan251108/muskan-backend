const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

const User = require("./models/User");
const Doctor = require("./models/Doctor");
const Appointment = require("./models/Appointment");

// JWT MIDDLEWARE
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token, access denied" });
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

// DATABASE
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// =======================
// AUTH ROUTES
// =======================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role });
    await user.save();
    if (role === "doctor") {
      const doctor = new Doctor({ userId: user._id });
      await doctor.save();
    }
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
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
// DOCTOR ROUTES
// =======================

// GET all doctors
app.get("/api/doctors", authMiddleware, async (req, res) => {
  try {
    const doctors = await Doctor.find().populate("userId", "name email");
    const result = doctors.map(doc => ({
      _id: doc._id,
      userId: doc.userId._id,
      name: doc.userId.name,
      email: doc.userId.email,
      specialization: doc.specialization,
      qualification: doc.qualification,
      experience: doc.experience,
      address: doc.address,
      fees: doc.fees,
      timing: doc.timings,
      available: doc.available,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single doctor public profile
app.get("/api/doctors/:id", authMiddleware, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate("userId", "name email");
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json({
      _id: doctor._id,
      name: doctor.userId.name,
      email: doctor.userId.email,
      specialization: doctor.specialization,
      qualification: doctor.qualification,
      experience: doctor.experience,
      address: doctor.address,
      fees: doctor.fees,
      timing: doctor.timings,
      available: doctor.available,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET doctor own profile
app.get("/api/doctor/profile", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: "Doctor profile not found" });
    res.json({
      _id: doctor._id,
      name: user.name,
      email: user.email,
      specialization: doctor.specialization,
      qualification: doctor.qualification,
      experience: doctor.experience,
      address: doctor.address,
      fees: doctor.fees,
      timing: doctor.timings,
      available: doctor.available,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT doctor profile update
app.put("/api/doctor/profile", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const { fees, timing, available, specialization, qualification, experience, address } = req.body;
    const doctor = await Doctor.findOneAndUpdate(
      { userId: req.user.id },
      { fees, timings: timing, available, specialization, qualification, experience, address },
      { new: true }
    );
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json({ message: "Profile updated successfully", doctor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET doctor appointments
app.get("/api/doctor/appointments", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    const appointments = await Appointment.find({ doctorId: doctor._id })
      .populate("patientId", "name email");
    const result = appointments.map(a => ({
      _id: a._id,
      patientName: a.patientId?.name || "Patient",
      email: a.patientId?.email,
      date: a.date,
      time: a.time,
      status: a.status,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT appointment status
app.put("/api/appointments/:id/status", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const { status } = req.body;
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    res.json({ message: "Status updated", appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PATIENT ROUTES
// =======================

// GET patient profile
app.get("/api/patient/profile", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      assignedDoctor: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET patient appointments
app.get("/api/patient/appointments", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.user.id })
      .populate("doctorId", "userId specialization fees timings");
    const result = await Promise.all(appointments.map(async (a) => {
      const doctorUser = await User.findById(a.doctorId?.userId);
      return {
        _id: a._id,
        doctorName: doctorUser?.name || "Doctor",
        specialization: a.doctorId?.specialization,
        date: a.date,
        time: a.time,
        status: a.status,
      };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST book appointment
app.post("/api/appointments", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const { doctorId, date, time } = req.body;
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    if (!doctor.available) return res.status(400).json({ message: "Doctor available nahi hai" });
    const appointment = new Appointment({
      doctorId: doctor._id,
      patientId: req.user.id,
      date,
      time,
    });
    await appointment.save();
    res.json({ message: "Appointment booked successfully", appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});