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

    // internal
    vehicleCode: { type: String, default: "" },
    category: { type: String, default: "" },
    classification: { type: String, default: "0" },
    months: { type: Number, default: 12 },

    // border
    borderVehicleType: { type: String, default: "" },

    quote: { type: QuoteSchema, default: () => ({}) },
  },
  { _id: false }
);

const VehicleSchema = new Schema(
  {
    vehicleType: { type: String, enum: ["syrian", "foreign"], required: true },

    ownerName: { type: String, required: true, trim: true },
    nationalId: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },

    plateNumber: { type: String, required: true, trim: true },
    plateCountry: { type: String, default: "SY", trim: true, uppercase: true },

    chassisNumber: { type: String, required: true, trim: true },
    engineNumber: { type: String, trim: true },

    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, required: true },

    color: { type: String, trim: true },
    fuelType: { type: String, trim: true },

    // foreign fields
    passportNumber: { type: String, trim: true },
    nationality: { type: String, trim: true },
    entryDate: { type: Date },
    exitDate: { type: Date },
    customsDocument: { type: String, trim: true },
    entryPoint: { type: String, trim: true },

    policyDuration: { type: String, trim: true },
    coverage: { type: String, trim: true },
    notes: { type: String, trim: true },

    // ✅ مهم: صارت OPTIONAL + default
    pricing: { type: PricingSchema, default: () => ({}) },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
  },
  { timestamps: true }
);

// ✅ index مركب بدل plateNumber لوحده
VehicleSchema.index({ plateNumber: 1, plateCountry: 1 }, { unique: true });

// ✅ لتفادي OverwriteModelError مع hot reload
export default (mongoose.models.Vehicle as mongoose.Model<any>) ||
  mongoose.model("Vehicle", VehicleSchema);
