import mongoose, { Schema, Document } from "mongoose";

type VehicleModelName = "SyrianVehicle" | "ForeignVehicle";

type QuoteBreakdown = {
  netPremium: number;
  stampFee: number;
  warEffort: number;
  martyrFund: number;
  localAdministration: number;
  reconstruction: number;
  total: number;
};

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

export interface IPayment extends Document {
  vehicleModel: VehicleModelName;
  vehicleId: mongoose.Types.ObjectId;

  policyNumber: string;
  amount: number;

  paymentMethod: "cash" | "card" | "bank-transfer" | "check";
  paymentStatus: "pending" | "completed" | "failed" | "refunded";
  receiptNumber: string;

  paidBy: string;
  payerPhone?: string;
  notes?: string;
  processedBy: mongoose.Types.ObjectId;
  paymentDate: Date;

  // Snapshots
  pricingInput?: any;
  breakdown?: QuoteBreakdown;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema(
  {
    // ✅ أهم شي: refPath
    vehicleModel: {
      type: String,
      enum: ["SyrianVehicle", "ForeignVehicle"],
      required: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "vehicleModel",
    },

    policyNumber: { type: String, required: true },
    amount: { type: Number, required: true },

    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank-transfer", "check"],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },

    receiptNumber: { type: String, required: true, unique: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null, index: true },


    paidBy: { type: String, required: true },
    payerPhone: { type: String },
    notes: { type: String },

    processedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    paymentDate: { type: Date, default: Date.now },

    pricingInput: { type: Schema.Types.Mixed, default: undefined },
    breakdown: { type: QuoteSchema, default: undefined },

    insuranceCompany: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "InsuranceCompany",
  default: null,
  index: true,
},

  },
  { timestamps: true }
);

PaymentSchema.index({ policyNumber: 1 });
PaymentSchema.index({ paymentStatus: 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ insuranceCompany: 1, paidAt: -1 });
PaymentSchema.index({ paymentStatus: 1 });
PaymentSchema.index({ insuranceCompany: 1, paymentStatus: 1 });

export default mongoose.model<IPayment>("Payment", PaymentSchema);
