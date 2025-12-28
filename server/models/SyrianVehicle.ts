import mongoose, { Schema } from "mongoose";

const QuoteSchema = new Schema(
  {
    netPremium: { type: Number, default: 0 },
    stampFee: { type: Number, default: 0 },
    warEffort: { type: Number, default: 0 },
    martyrFund: { type: Number, default: 0 },
    localAdministration: { type: Number, default: 0 },
    reconstruction: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const PricingSchema = new Schema(
  {
    insuranceType: { type: String, enum: ["internal", "border"] },
    vehicleCode: { type: String, default: "" },
    category: { type: String, default: "" },
    classification: { type: String, default: "0" },
    months: { type: Number, default: 12 },
    borderVehicleType: { type: String, default: "" },
    quote: { type: QuoteSchema, default: () => ({}) },
  },
  { _id: false }
);

const SyrianVehicleSchema = new Schema(
  {
    vehicleType: { type: String, default: "syrian" },

    ownerName: { type: String, required: true },
    nationalId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    address: { type: String, required: true },

    plateNumber: { type: String, required: true },
    plateCountry: { type: String, default: "SY" },

    chassisNumber: { type: String, required: true },
    engineNumber: { type: String },

    brand: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },

    color: { type: String },
    fuelType: { type: String },

    policyDuration: { type: String },
    coverage: { type: String },
    notes: { type: String },

    pricing: { type: PricingSchema, required: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
  },
  { timestamps: true, collection: "syrian_vehicles" }
);

SyrianVehicleSchema.index({ plateNumber: 1, plateCountry: 1 }, { unique: true });

export default mongoose.model("SyrianVehicle", SyrianVehicleSchema);
