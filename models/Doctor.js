const mongoose = require("mongoose");

const DoctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  specialization: {
    type: String
  },
  fees: {
    type: Number,
    default: 0
  },
  timings: {
    type: String,
    default: "Not set"
  },
  available: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model("Doctor", DoctorSchema);
