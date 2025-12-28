import mongoose, { Schema } from "mongoose";

const InsuranceCompanySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    sharePercent: { type: Number, required: true, default: 0 }, // 0..100
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("InsuranceCompany", InsuranceCompanySchema);
