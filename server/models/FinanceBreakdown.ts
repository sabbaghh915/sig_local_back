import mongoose, { Schema } from "mongoose";

const FinanceBreakdownSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment", required: true, unique: true, index: true },
    policyNumber: { type: String, index: true },

    policyId: { type: Schema.Types.ObjectId, ref: "MandatoryPolicy", index: true },

    centerId: { type: Schema.Types.ObjectId, ref: "Center", index: true },
    insuranceCompanyId: { type: Schema.Types.ObjectId, ref: "InsuranceCompany", index: true },

    netPremium: { type: Number, default: 0 },            // صافي القسط (حصة الشركة)
    stampFee: { type: Number, default: 0 },              // رسم الطابع
    warEffort: { type: Number, default: 0 },             // المجهود الحربي
    martyrFund: { type: Number, default: 0 },            // طابع/صندوق الشهيد
    localAdministration: { type: Number, default: 0 },   // الإدارة المحلية
    agesFee: { type: Number, default: 0 },               // رسم الأعمار (إذا عندك)
    reconstruction: { type: Number, default: 0 },        // البدل المقترح/إعادة الإعمار

    federationFee: { type: Number, default: 0 },         // حصة الاتحاد (إن وجدت عندك)
    total: { type: Number, default: 0 },                 // الإجمالي

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "finance_breakdowns", timestamps: true }
);

export default mongoose.models.FinanceBreakdown ||
  mongoose.model("FinanceBreakdown", FinanceBreakdownSchema);
