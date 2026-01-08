import mongoose, { Schema, Types } from "mongoose";

const PolicyRecordSchema = new Schema(
  {
    vehicleModel: { type: String, enum: ["SyrianVehicle", "ForeignVehicle"], required: true },
    vehicleId: { type: Types.ObjectId, required: true, index: true },

    // من المركبة
    ownerName: String,
    nationalId: String,
    phoneNumber: String,
    address: String,
    plateNumber: String,
    chassisNumber: String,
    engineNumber: String,

    brand: String,
    model: String,
    year: Number,
    color: String,
    manufacturer: String, // الصانع (إن توفر)
    coverage: String,

    // من الدفعة/البوليصة
    paymentId: { type: Types.ObjectId, index: true },
    policyNumber: { type: String, index: true },
    receiptNumber: { type: String, index: true },

    amount: Number,
    paymentStatus: String,
    paymentMethod: String,
    paidBy: String,
    payerPhone: String,

    // نطاق المركز/الشركة
    center: { type: Types.ObjectId, ref: "Center", index: true }, // نفس حقل payments (center)
    centerId: { type: Types.ObjectId, ref: "Center", index: true }, // لو عندك بالسيارات centerId
    insuranceCompany: { type: Types.ObjectId, ref: "InsuranceCompany", index: true },

    processedBy: { type: Types.ObjectId, ref: "User" },

    // تواريخ الوثيقة
    issuedAt: Date,
    policyStartAt: Date,
    policyEndAt: Date,

    // تفصيل التسعير (اختياري تخزينه كامل)
    pricingInput: Schema.Types.Mixed,
    breakdown: Schema.Types.Mixed,

    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active", index: true },
  },
  { timestamps: true, collection: "policy_records" }
);

// قيود اختيارية
PolicyRecordSchema.index({ vehicleId: 1, vehicleModel: 1 }, { unique: true }); // سجل واحد لكل مركبة (آخر حالة)
//PolicyRecordSchema.index({ policyNumber: 1 }, { unique: false });
//PolicyRecordSchema.index({ receiptNumber: 1 }, { unique: false });

export default mongoose.model("PolicyRecord", PolicyRecordSchema);
