import mongoose, { Schema, Document, Types } from "mongoose";

export type PricingMeta = {
  label?: string;     // وصف مفتاح التسعير
  group?: string;     // فئة/نوع (سياحي، شحن، باص…)
  duration?: string;  // مدة (3/6/12 أو شهري/ربع/نصف…)
};

export interface IPricingConfig extends Document {
  internal: Map<string, number>;
  border: Map<string, number>;

  internalMeta: Map<string, PricingMeta>;
  borderMeta: Map<string, PricingMeta>;

  version: number;
  updatedBy?: Types.ObjectId | null;
  updatedAt: Date;
  createdAt: Date;
}

const PricingMetaSchema = new Schema<PricingMeta>(
  {
    label: { type: String, default: "" },
    group: { type: String, default: "" },
    duration: { type: String, default: "" },
  },
  { _id: false }
);

const PricingConfigSchema = new Schema<IPricingConfig>(
  {
    internal: { type: Map, of: Number, default: {} },
    border: { type: Map, of: Number, default: {} },

    internalMeta: { type: Map, of: PricingMetaSchema, default: {} },
    borderMeta: { type: Map, of: PricingMetaSchema, default: {} },

    version: { type: Number, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IPricingConfig>("PricingConfig", PricingConfigSchema);
