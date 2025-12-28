const mongoose = require("mongoose");

const CenterSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    ip: { type: String, trim: true },
    code: { type: String, trim: true },
    province: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Center", CenterSchema);
