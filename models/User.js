import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "employee", "PM"],
    default: "employee",
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null,
  },
  passwordResetOtpHash: {
    type: String,
    default: "",
  },
  passwordResetOtpExpiresAt: {
    type: Date,
    default: null,
  },
  passwordResetOtpRequestedAt: {
    type: Date,
    default: null,
  },
});

export default mongoose.model("User", userSchema);
