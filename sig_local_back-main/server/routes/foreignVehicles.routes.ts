// routes/foreignVehicles.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { ForeignVehicle } from "../models/ForeignVehicle";
import { resolveCenterScope } from "../utils/tenant";

const r = Router();

r.get("/", requireAuth, async (req, res) => {
  const centerScope = resolveCenterScope(req);

  const filter: any = {};
  if (centerScope) filter.centerId = centerScope;

  // خيار إضافي: showMine=1 لعرض ما أنشأه المستخدم فقط
  if (req.query.showMine === "1") filter.createdBy = req.user!.id;

  const items = await ForeignVehicle.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("createdBy", "username fullName")
    .populate("centerId", "name code");

  res.json({ data: items });
});

r.post("/", requireAuth, async (req, res) => {
  const u = req.user!;
  if (u.role === "admin") {
    // admin لازم يحدد centerId عند إنشاء سجل (أو تختار سياسة معينة)
    if (!req.body.centerId) return res.status(400).json({ message: "centerId is required" });
  } else {
    // الموظف لا يحدد centerId أبداً — السيرفر يضعه
    req.body.centerId = u.centerId;
  }

  req.body.createdBy = u.id;

  const doc = await ForeignVehicle.create(req.body);
  res.status(201).json({ data: doc });
});

export default r;
