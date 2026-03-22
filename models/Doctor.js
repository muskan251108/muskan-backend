const mongoose = require("mongoose");

const DoctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  specialization: { type: String, default: "" },
  qualification:  { type: String, default: "" },
  experience:     { type: String, default: "" },
  address:        { type: String, default: "" },
  fees:           { type: Number, default: 0 },
  timing:         { type: String, default: "Not set" }, // ✅ "timings" → "timing" fix
  available:      { type: Boolean, default: true },
});

module.exports = mongoose.model("Doctor", DoctorSchema);