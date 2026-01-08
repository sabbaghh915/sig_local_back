import mongoose, { Schema, Document } from "mongoose";

type VehicleModelName = "SyrianVehicle" | "ForeignVehicle";

type QuoteBreakdown = {
  netPremium: number;
  stampFee: number;
  warEffort: number;
  martyrFund: number;
  localAdministration: number;
  reconstruction: number;

  // ✅ إضافات كثيرة عندك فعلياً بالـ DB
  agesFee?: number;
  federationFee?: number;

  electronicCardFee?: number;
  premiumServiceFee?: number;
  rescueServiceFee?: number;

  subtotal?: number;
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

    agesFee: { type: Number, default: 0 },
    federationFee: { type: Number, default: 0 },

    electronicCardFee: { type: Number, default: 0 },
    premiumServiceFee: { type: Number, default: 0 },
    rescueServiceFee: { type: Number, default: 0 },

    subtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    // ✅ (اختياري) flags إذا بدك تحفظها هنا أيضاً
    electronicCard: { type: Boolean, default: false },
    premiumService: { type: Boolean, default: false },
    rescueService: { type: Boolean, default: false },
  },
  { _id: false, strict: false } // ✅ مهم حتى لو وصل حقول إضافية ما تنحذف
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
  center?: mongoose.Types.ObjectId | null;

  insuranceCompany?: mongoose.Types.ObjectId | null;

  paymentDate: Date;

  // ✅ NEW: تواريخ/أوقات البوليصة
  issuedAt?: Date;        // وقت الإصدار (قد يساوي وقت الدفع أو مختلف حسب اختيارك)
  policyStartAt?: Date;   // بداية صلاحية البوليصة
  policyEndAt?: Date;     // نهاية صلاحية البوليصة

  // Snapshots
  pricingInput?: any;
  breakdown?: QuoteBreakdown;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema(
  {
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

    // ✅ NEW
    issuedAt: { type: Date, default: Date.now },
    policyStartAt: { type: Date, default: undefined },
    policyEndAt: { type: Date, default: undefined },

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

// ✅ FIX: كان عندك paidAt غير موجود
PaymentSchema.index({ insuranceCompany: 1, paymentDate: -1 });
PaymentSchema.index({ insuranceCompany: 1, paymentStatus: 1 });

export default mongoose.model<IPayment>("Payment", PaymentSchema);
