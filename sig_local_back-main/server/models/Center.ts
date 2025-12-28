import mongoose from "mongoose";

const CenterSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, unique: true, sparse: true }, // رقم المركز من Excel
    name: { type: String, required: true, trim: true },
    ip: { type: String, trim: true }, // Center_Address من الإكسل إذا كانت IP
    code: { type: String, trim: true }, // Center_Note من الإكسل
    province: { type: String, trim: true }, // Center_Cat
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Center", CenterSchema);
