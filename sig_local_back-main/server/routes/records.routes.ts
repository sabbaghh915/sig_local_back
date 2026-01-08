import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { resolveCenterScope } from "../utils/tenant";
import PolicyRecord from "../models/PolicyRecord";

const r = Router();

r.get("/", requireAuth, async (req, res) => {
  const centerScope = resolveCenterScope(req);

  const filter: any = {};
  if (centerScope) {
    // حسب نظامك: بعض البيانات center وبعضها centerId
    filter.$or = [{ center: centerScope }, { centerId: centerScope }];
  }

  if (req.query.vehicleModel) filter.vehicleModel = String(req.query.vehicleModel);
  if (req.query.status) filter.status = String(req.query.status);

  // بحث
  const q = String(req.query.q || "").trim();
  if (q) {
    filter.$and = (filter.$and || []).concat([
      {
        $or: [
          { ownerName: new RegExp(q, "i") },
          { nationalId: new RegExp(q, "i") },
          { plateNumber: new RegExp(q, "i") },
          { policyNumber: new RegExp(q, "i") },
          { receiptNumber: new RegExp(q, "i") },
        ],
      },
    ]);
  }

  const items = await PolicyRecord.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .populate("center", "name code")
    .populate("centerId", "name code")
    .populate("insuranceCompany", "name")
    .populate("processedBy", "username fullName");

  res.json({ data: items });
});

export default r;
