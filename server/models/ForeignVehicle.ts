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
    months: { type: Number, default: 12 },
    borderVehicleType: { type: String, default: "" },
    quote: { type: QuoteSchema, default: () => ({}) },
  },
  { _id: false }
);

const ForeignVehicleSchema = new Schema(
  {
    vehicleType: { type: String, default: "foreign" },

    ownerName: { type: String, required: true },
    nationalId: { type: String, required: true }, // نخزن فيه passportNumber مثل شغلك الحالي
    passportNumber: { type: String },
    nationality: { type: String },

    phoneNumber: { type: String, required: true },
    address: { type: String, required: true },

    plateNumber: { type: String, required: true },
    plateCountry: { type: String, required: true },

    chassisNumber: { type: String, required: true },
    engineNumber: { type: String },

    brand: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },

    color: { type: String },
    fuelType: { type: String },

    entryDate: { type: Date },
    exitDate: { type: Date },
    customsDocument: { type: String },
    entryPoint: { type: String },

    policyDuration: { type: String },
    coverage: { type: String, default: "border-insurance" },
    notes: { type: String },

    pricing: { type: PricingSchema, required: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
  },
  { timestamps: true, collection: "foreign_vehicles" }
);

ForeignVehicleSchema.index({ plateNumber: 1, plateCountry: 1 }, { unique: true });

export default mongoose.model("ForeignVehicle", ForeignVehicleSchema);
