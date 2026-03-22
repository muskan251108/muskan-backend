const express    = require("express");
const mongoose   = require("mongoose");
const dotenv     = require("dotenv");
const cors       = require("cors");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const nodemailer = require("nodemailer");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

const User        = require("./models/User");
const Doctor      = require("./models/Doctor");
const Appointment = require("./models/Appointment");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendAppointmentEmail = async (toEmail, patientName, doctorName, date, time, fees, status) => {
  try {
    await transporter.sendMail({
      from: `"MUSKAN Healthcare" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Appointment ${status}`,
      html: `<h2>Appointment ${status}</h2>
             <p>Patient: ${patientName}</p>
             <p>Doctor: Dr. ${doctorName}</p>
             <p>Date: ${date}</p>
             <p>Time: ${time}</p>
             <p>Fees: ₹${fees}</p>`,
    });
  } catch (err) { console.log("Email error:", err.message); }
};

// MIDDLEWARE
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ message: "Invalid token" }); }
};

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ message: "Access denied" });
  next();
};

// ========== AUTH ==========
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed, role });
    await user.save();
    if (role === "doctor") await new Doctor({ userId: user._id }).save();
    res.json({ message: "Registered successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid password" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({ token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== DOCTOR ROUTES ==========
app.get("/api/doctor/profile", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: "Doctor profile not found" });
    const user = await User.findById(req.user.id).select("name email");
    res.json({ ...doctor.toObject(), name: user.name, email: user.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/doctor/profile", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const doctor = await Doctor.findOneAndUpdate(
      { userId: req.user.id }, req.body, { new: true }
    );
    res.json(doctor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/doctor/appointments", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    const appointments = await Appointment.find({ doctorId: doctor._id })
      .populate("patientId", "name email")
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/appointments/:id/status", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id, { status: req.body.status }, { new: true }
    ).populate("patientId", "name email").populate("doctorId");
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    const doctorUser = await User.findById(appointment.doctorId.userId);
    await sendAppointmentEmail(
      appointment.patientId.email, appointment.patientId.name,
      doctorUser.name, appointment.date, appointment.time,
      appointment.doctorId.fees, req.body.status
    );
    res.json(appointment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== PATIENT ROUTES ==========
app.get("/api/patient/profile", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name email role");
    if (!user) return res.status(404).json({ message: "User not found" });
    const lastConfirmed = await Appointment.findOne({ patientId: req.user.id, status: "confirmed" })
      .sort({ createdAt: -1 })
      .populate({ path: "doctorId", populate: { path: "userId", select: "name" } });
    let assignedDoctor = null;
    if (lastConfirmed?.doctorId) {
      assignedDoctor = {
        _id: lastConfirmed.doctorId._id,
        name: lastConfirmed.doctorId.userId?.name,
        specialization: lastConfirmed.doctorId.specialization,
        fees: lastConfirmed.doctorId.fees,
        timing: lastConfirmed.doctorId.timing,
      };
    }
    res.json({ ...user.toObject(), assignedDoctor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/patient/appointments", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.user.id })
      .populate({ path: "doctorId", populate: { path: "userId", select: "name" } })
      .sort({ createdAt: -1 });
    const formatted = appointments.map((a) => ({
      _id: a._id,
      date: a.date,
      time: a.time,
      status: a.status,
      isPaid: a.isPaid,
      doctor: {
        name: a.doctorId?.userId?.name || "Unknown",
        specialization: a.doctorId?.specialization || "",
        fees: a.doctorId?.fees || 0,
        timing: a.doctorId?.timing || "",
      },
    }));
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/appointments", authMiddleware, allowRoles("patient"), async (req, res) => {
  try {
    const { doctorId, date, time } = req.body;
    if (!doctorId || !date || !time)
      return res.status(400).json({ message: "doctorId, date aur time required hain" });
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    if (!doctor.available) return res.status(400).json({ message: "Doctor abhi available nahi hai" });
    const appointment = new Appointment({ patientId: req.user.id, doctorId, date, time, status: "pending" });
    await appointment.save();
    res.json({ message: "Appointment book ho gayi!", appointment });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ALL DOCTORS ==========
app.get("/api/doctors", authMiddleware, async (req, res) => {
  try {
    const doctors = await Doctor.find().populate("userId", "name email");
    const formatted = doctors.map((d) => ({
      _id: d._id,
      name: d.userId?.name || "Unknown",
      email: d.userId?.email || "",
      specialization: d.specialization,
      qualification: d.qualification,
      experience: d.experience,
      address: d.address,
      fees: d.fees,
      timing: d.timing,
      available: d.available,
    }));
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/doctors/:id", authMiddleware, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate("userId", "name email");
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json({
      _id: doctor._id,
      name: doctor.userId?.name || "Unknown",
      email: doctor.userId?.email || "",
      specialization: doctor.specialization,
      qualification: doctor.qualification,
      experience: doctor.experience,
      address: doctor.address,
      fees: doctor.fees,
      timing: doctor.timing,
      available: doctor.available,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));