import { Router } from "express";
import PricingConfig from "../models/PricingConfig";
import { protect } from "../middleware/auth";
import type { AuthRequest } from "../types/AuthRequest";

const router = Router();

function requireAdmin(req: AuthRequest, res: any, next: any) {
  const role = (req.user as any)?.role;
  if (role !== "admin") return res.status(403).json({ success: false, message: "Forbidden" });
  next();
}

router.get("/", protect, requireAdmin, async (_req, res) => {
  let cfg = await PricingConfig.findOne().lean();
  if (!cfg) {
    cfg = (await PricingConfig.create({
      internal: {},
      border: {},
      internalMeta: {},
      borderMeta: {},
      version: 1,
    })).toObject();
  }
  res.json({ success: true, data: cfg });
});

// ✅ حفظ كامل
router.put("/", protect, requireAdmin, async (req: AuthRequest, res) => {
  const { internal, border, internalMeta, borderMeta } = req.body || {};
  if (!internal || !border) {
    return res.status(400).json({ success: false, message: "internal & border required" });
  }

  let cfg = await PricingConfig.findOne();
  if (!cfg) cfg = new PricingConfig();

  cfg.internal = internal;
  cfg.border = border;

  // meta اختياري
  if (internalMeta) cfg.internalMeta = internalMeta;
  if (borderMeta) cfg.borderMeta = borderMeta;

  cfg.version = (cfg.version || 1) + 1;
  cfg.updatedBy = req.user?._id ?? null;

  await cfg.save();
  res.json({ success: true, data: cfg });
});

// ✅ إضافة/تعديل بند واحد (يدوي) — يعمل حتى لو المفتاح جديد
router.patch("/item", protect, requireAdmin, async (req: AuthRequest, res) => {
  const { scope, key, value, meta } = req.body || {};
  if (!["internal", "border"].includes(scope)) {
    return res.status(400).json({ success: false, message: "scope invalid" });
  }
  if (!key || typeof key !== "string") {
    return res.status(400).json({ success: false, message: "key required" });
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return res.status(400).json({ success: false, message: "value must be number" });
  }

  const cfg = await PricingConfig.findOne();
  if (!cfg) return res.status(404).json({ success: false, message: "No pricing config" });

  // value
  (cfg as any)[scope].set(key, value);

  // meta
  const metaField = scope === "internal" ? "internalMeta" : "borderMeta";
  const prev = (cfg as any)[metaField].get(key) || {};
  (cfg as any)[metaField].set(key, { ...prev, ...(meta || {}) });

  cfg.version = (cfg.version || 1) + 1;
  cfg.updatedBy = req.user?._id ?? null;

  await cfg.save();
  res.json({ success: true, data: cfg });
});

// ✅ حذف بند
router.delete("/item", protect, requireAdmin, async (req: AuthRequest, res) => {
  const { scope, key } = req.query as any;
  if (!["internal", "border"].includes(scope)) {
    return res.status(400).json({ success: false, message: "scope invalid" });
  }
  if (!key) return res.status(400).json({ success: false, message: "key required" });

  const cfg = await PricingConfig.findOne();
  if (!cfg) return res.status(404).json({ success: false, message: "No pricing config" });

  (cfg as any)[scope].delete(key);

  const metaField = scope === "internal" ? "internalMeta" : "borderMeta";
  (cfg as any)[metaField].delete(key);

  cfg.version = (cfg.version || 1) + 1;
  cfg.updatedBy = req.user?._id ?? null;

  await cfg.save();
  res.json({ success: true, data: cfg });
});

export default router;
