const mongoose = require("mongoose");

const AppointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
  date: String,
  time: String,
  status: { type: String, default: "pending" },

  paymentId: String,
  orderId: String,
  isPaid: { type: Boolean, default: false },
});

module.exports = mongoose.model("Appointment", AppointmentSchema);