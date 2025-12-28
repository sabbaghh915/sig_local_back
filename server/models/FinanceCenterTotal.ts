import mongoose, { Schema } from "mongoose";

const FinanceCenterTotalSchema = new Schema(
  {
    center: { type: Schema.Types.ObjectId, ref: "Center", required: true, index: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    totalAmount: { type: Number, required: true, default: 0 },
    paymentsCount: { type: Number, required: true, default: 0 },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

// حتى ما تتكرر نفس الفترة لنفس المركز
FinanceCenterTotalSchema.index({ center: 1, from: 1, to: 1 }, { unique: true });

export default mongoose.model("FinanceCenterTotal", FinanceCenterTotalSchema);
