import express from "express";
import { authorize, protect } from "../middleware/auth";
import { requireAuth, allowRoles } from "../middleware/auth";
import { requireRole } from "../middleware/permissions.ts";
import User from "../models/User";
import Center from "../models/Center";
import bcrypt from "bcryptjs";
import { getFinanceBreakdownByCenter } from "../controllers/adminFinance.controller";
import mongoose from "mongoose";
import { getFinanceDistributionByCompany } from "../controllers/adminFinance.controller";
import {  rebuildFinanceByCenter } from "../controllers/adminFinance.controller";
import {  requirePermission } from "../middleware/permissions";






const router = express.Router();

const requireAdmin = (req: AuthRequest, res: Response, next: any) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};

router.get("/users", protect, async (req, res) => {
  res.json([]);
});

/** مراكز - للـ dropdown */
router.get("/centers", requireAuth, allowRoles("admin"), async (_req, res) => {
  const centers = await Center.find({ isActive: true }).sort({ name: 1 });
  res.json({ data: centers });
});

/** قائمة المستخدمين (فلترة حسب مركز اختياري) */
router.get("/users", requireAuth, allowRoles("admin"), async (req, res) => {
  const filter: any = {};
  if (req.query.centerId) filter.centerId = String(req.query.centerId);

  const users = await User.find(filter)
    .select("username fullName email role employeeId centerId isActive lastLoginIp lastLoginAt createdAt")
    .sort({ createdAt: -1 })
    .populate("centerId", "name code");

  res.json({ data: users });
});

/** إنشاء موظف/مستخدم */
router.post("/users", requireAuth, allowRoles("admin"), async (req, res) => {
  const { username, password, email, fullName, role, employeeId, centerId } = req.body || {};

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // أي دور غير admin لازم يكون له مركز
  if (role !== "admin" && !centerId) {
    return res.status(400).json({ message: "centerId is required for non-admin users" });
  }

  const exists = await User.findOne({ username });
  if (exists) return res.status(409).json({ message: "username already exists" });

  const passwordHash = await bcrypt.hash(String(password), 10);

  const user = await User.create({
    username,
    fullName,
    email,
    role,
    employeeId,
    centerId: role === "admin" ? null : centerId,
    passwordHash,
    isActive: true,
  });

  res.status(201).json({ data: user });
});

/** حذف مستخدم */
router.delete("/users/:id", requireAuth, allowRoles("admin"), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});


router.get(
  "/finance/breakdown",
  protect,
  requireAuth,
  getFinanceBreakdownByCenter
);

router.get("/finance/distribution", protect, requireAuth, getFinanceDistributionByCompany);



// ✅ إنشاء أدمن مساعد
router.post("/assistant-admins", protect, requireRole("admin"), async (req, res) => {
  const { username, fullName, email, password, permissions } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "username/password مطلوبين" });
  }

  const exists = await User.findOne({ $or: [{ username }, ...(email ? [{ email }] : [])] });
  if (exists) return res.status(409).json({ success: false, message: "المستخدم موجود مسبقاً" });

  const hash = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
  email,
  fullName,
  password,          // ✅ plaintext فقط، الموديل سيعمل hash مرة واحدة
  role: "assistant_admin",
  permissions: permissions || [],
  isActive: true,
  });

  return res.json({ success: true, data: { _id: user._id, username, fullName, email, role: user.role, permissions: user.permissions, isActive: user.isActive } });
});

// ✅ قائمة الأدمن المساعدين
router.get("/assistant-admins", protect, requireRole("admin"), async (req, res) => {
  const list = await User.find({ role: "assistant_admin" })
    .select("_id username fullName email role permissions isActive createdAt")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: list });
});

// ✅ تعديل صلاحيات/تفعيل-تعطيل
router.put("/assistant-admins/:id", protect, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid id" });

  const { permissions, isActive, fullName, email } = req.body;

  const updated = await User.findByIdAndUpdate(
    id,
    {
      ...(typeof fullName === "string" ? { fullName } : {}),
      ...(typeof email === "string" ? { email } : {}),
      ...(Array.isArray(permissions) ? { permissions } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
    { new: true }
  ).select("_id username fullName email role permissions isActive");

  if (!updated) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: updated });
});

router.get(
  "/finance/breakdown",
  protect,
  requireAdmin,
  getFinanceBreakdownByCenter
);

router.get(
  "/finance/breakdown",
  protect,
  requireRole("admin", "assistant_admin"),
  requirePermission("view_finance"),
  getFinanceBreakdownByCenter
);

router.post(
  "/finance/rebuild",
  protect,
  requireRole("admin"),
  rebuildFinanceByCenter
);

router.get("/admin/dashboard", protect, requireRole("admin"));

router.get("/assistant/dashboard", protect, requireRole("assistant_admin", "admin"));









export default router;
