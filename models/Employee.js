import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  employeeCode: {
    type: String,
    unique: true,
    sparse: true,
    match: /^\d{4}$/,
  },
  name: String,
  email: String,
  role: String,
  avatar: String,
  phone: String,
  address: String,
  bankAccount: {
    type: String,
    default: "",
  },
  salary: {
    type: Number,
    default: 0,
  },
});

export default mongoose.model("Employee", employeeSchema);
