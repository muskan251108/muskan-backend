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

const User = require("./models/User");
const Doctor = require("./models/Doctor");
const Appointment = require("./models/Appointment");

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

// Transporter verify karo startup pe
transporter.verify((error, success) => {
  if (error) {
    console.log("❌ Email transporter error:", error);
  } else {
    console.log("✅ Email transporter ready!");
  }
});

const sendAppointmentEmail = async (toEmail, patientName, doctorName, date, time, fees, status) => {
  const isConfirmed = status === "confirmed";
  const isCancelled = status === "cancelled";
  const isBooked = status === "booked";

  let statusColor = "#00a8ff";
  let statusText = "Booked 📋";
  let statusMsg = "Aapki appointment book ho gayi hai!";

  if (isConfirmed) {
    statusColor = "#48bb78";
    statusText = "Confirmed ✅";
    statusMsg = "Aapki appointment confirm ho gayi hai! Please time par aayein.";
  } else if (isCancelled) {
    statusColor = "#fc8181";
    statusText = "Cancelled ❌";
    statusMsg = "Aapki appointment cancel ho gayi hai. Dobara book kar sakte hain.";
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0f1f3d,#1a3a6b);padding:32px 28px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">🌸</div>
        <div style="font-size:22px;font-weight:800;color:#00a8ff;letter-spacing:2px;">MUSKAN</div>
        <div style="font-size:13px;color:#a0aec0;margin-top:4px;letter-spacing:2px;">THE WAY TO HAPPINESS</div>
      </div>

      <!-- Status Banner -->
      <div style="background:${statusColor}20;border-left:4px solid ${statusColor};padding:16px 28px;">
        <div style="font-size:16px;font-weight:700;color:${statusColor};">${statusText}</div>
        <div style="font-size:13px;color:#4a5568;margin-top:4px;">${statusMsg}</div>
      </div>

      <!-- Greeting -->
      <div style="padding:24px 28px 0;">
        <div style="font-size:18px;font-weight:700;color:#1a202c;">Namaste, ${patientName}! 👋</div>
        <div style="font-size:14px;color:#718096;margin-top:6px;">Aapki appointment ki details neeche hain:</div>
      </div>

      <!-- Appointment Card -->
      <div style="margin:20px 28px;background:#f8fafc;border-radius:16px;border:1.5px solid #e2e8f0;overflow:hidden;">

        <div style="background:linear-gradient(135deg,#00a8ff15,#0057ff15);padding:20px 24px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:13px;color:#718096;font-weight:600;margin-bottom:4px;">DOCTOR</div>
          <div style="font-size:20px;font-weight:800;color:#1a202c;">Dr. ${doctorName}</div>
        </div>

        <div style="padding:0 24px;">
          <div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #e2e8f0;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:18px;">📆</span>
              <div>
                <div style="font-size:11px;color:#718096;font-weight:600;">DATE</div>
                <div style="font-size:15px;font-weight:700;color:#1a202c;">${date}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:18px;">⏰</span>
              <div>
                <div style="font-size:11px;color:#718096;font-weight:600;">TIME</div>
                <div style="font-size:15px;font-weight:700;color:#1a202c;">${time}</div>
              </div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:18px;">💰</span>
              <div>
                <div style="font-size:11px;color:#718096;font-weight:600;">CONSULTATION FEES</div>
                <div style="font-size:15px;font-weight:700;color:#1a202c;">₹${fees || "N/A"}</div>
              </div>
            </div>
            <div style="background:${statusColor}20;padding:6px 16px;border-radius:20px;">
              <div style="font-size:13px;font-weight:700;color:${statusColor};">${statusText}</div>
            </div>
          </div>
        </div>
      </div>

      ${isConfirmed ? `
      <div style="margin:0 28px 20px;background:#fffbeb;border-radius:12px;padding:16px 20px;border:1px solid #f6ad55;">
        <div style="font-size:13px;font-weight:700;color:#92400e;">⚠️ Yaad Rakhein</div>
        <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#92400e;">
          <li>Appointment se 10 minute pehle pahunchein</li>
          <li>Apna ID proof saath leke aayein</li>
          <li>Previous reports/prescriptions leke aayein</li>
        </ul>
      </div>
      ` : isCancelled ? `
      <div style="margin:0 28px 20px;background:#fff5f5;border-radius:12px;padding:16px 20px;border:1px solid #fc8181;">
        <div style="font-size:13px;color:#c53030;">Dobara appointment book karne ke liye MUSKAN app pe login karein.</div>
      </div>
      ` : `
      <div style="margin:0 28px 20px;background:#ebf8ff;border-radius:12px;padding:16px 20px;border:1px solid #90cdf4;">
        <div style="font-size:13px;color:#2b6cb0;">Aapki appointment pending hai. Doctor ke confirm karne par email aayegi.</div>
      </div>
      `}

      <!-- Footer -->
      <div style="background:#f8fafc;padding:20px 28px;text-align:center;border-top:1px solid #e2e8f0;">
        <div style="font-size:13px;color:#718096;">Koi sawaal? Hamare dashboard pe login karein.</div>
        <div style="font-size:12px;color:#a0aec0;margin-top:8px;">© 2024 MUSKAN Healthcare • The Way to Happiness 🌸</div>
      </div>
    </div>
  </body>
  </html>
  `;

  const info = await transporter.sendMail({
    from: `"MUSKAN Healthcare 🌸" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Appointment ${statusText} — MUSKAN Healthcare`,
    html,
  });

  console.log(`✅ Email sent to ${toEmail} — MessageID: ${info.messageId}`);
};

// =======================
// JWT MIDDLEWARE
// =======================
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

// PUT appointment status — EMAIL NOTIFICATION
app.put("/api/appointments/:id/status", authMiddleware, allowRoles("doctor"), async (req, res) => {
  try {
    const { status } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("patientId", "name email")
      .populate("doctorId");

    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    const doctorUser = await User.findById(appointment.doctorId?.userId);
    const doctorName = doctorUser?.name || "Doctor";
    const fees = appointment.doctorId?.fees || "N/A";

    console.log(`📧 Sending email to: ${appointment.patientId?.email}`);
    console.log(`📋 Status: ${status}, Doctor: ${doctorName}`);

    if (appointment.patientId?.email) {
      try {
        await sendAppointmentEmail(
          appointment.patientId.email,
          appointment.patientId.name,
          doctorName,
          appointment.date,
          appointment.time,
          fees,
          status
        );
      } catch (emailErr) {
        console.log("❌ Email error FULL:", emailErr);
      }
    } else {
      console.log("⚠️ No patient email found!");
    }

    res.json({ message: "Status updated", appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// PATIENT ROUTES
// =======================

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

    // Booking confirmation email
    const patient = await User.findById(req.user.id);
    const doctorUser = await User.findById(doctor.userId);
    if (patient?.email) {
      try {
        await sendAppointmentEmail(
          patient.email,
          patient.name,
          doctorUser?.name || "Doctor",
          date,
          time,
          doctor.fees,
          "booked"
        );
        console.log(`✅ Booking confirmation email sent to ${patient.email}`);
      } catch (e) {
        console.log("❌ Booking email error:", e);
      }
    }

    res.json({ message: "Appointment booked successfully", appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});