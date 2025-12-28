import mongoose from "mongoose";

const CarModelSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, required: true, unique: true, index: true }, // CM_ID
    make: { type: String, required: true, trim: true, index: true }, // CM_Manufact
    type: { type: String, required: true, trim: true, index: true }, // CM_Type
    normalizedMake: { type: String, index: true },
    normalizedType: { type: String, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "car_models" }
);

export default mongoose.models.CarModel || mongoose.model("CarModel", CarModelSchema);
