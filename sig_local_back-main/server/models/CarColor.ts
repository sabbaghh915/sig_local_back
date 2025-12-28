import mongoose from "mongoose";

const CarColorSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, required: true, unique: true, index: true }, // CCID
    name: { type: String, required: true, trim: true }, // Car_Colors
    normalized: { type: String, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "car_colors" }
);

export default mongoose.models.CarColor || mongoose.model("CarColor", CarColorSchema);
