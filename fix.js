const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const User = require("./models/User");
const Doctor = require("./models/Doctor");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log("Connected");

  // Saare doctor role wale users dhundo
  const doctors = await User.find({ role: "doctor" });
  console.log(`${doctors.length} doctor users mile`);

  for (const user of doctors) {
    // Check karo Doctor entry already hai ya nahi
    const exists = await Doctor.findOne({ userId: user._id });
    if (!exists) {
      await Doctor.create({ userId: user._id });
      console.log(`✅ Doctor entry bani: ${user.name}`);
    } else {
      console.log(`⏭️ Already exists: ${user.name}`);
    }
  }

  console.log("Done!");
  process.exit();
}).catch(err => { console.log(err); process.exit(); });