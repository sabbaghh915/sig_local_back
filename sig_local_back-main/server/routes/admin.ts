import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import User from "../models/User";
import Center from "../models/Center";
import { requireAuth, allowRoles } from "../middleware/auth";
import bcrypt from "bcryptjs";






const router = Router();

// Middleware بسيط: فقط admin
const requireAdmin = (req: AuthRequest, res: Response, next: any) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};

// GET /api/admin/users
router.get("/users", protect, requireAdmin, async (req: AuthRequest, res: Response) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  res.json({ success: true, count: users.length, data: users });
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
  const finalCenter = role === "admin" ? null : (req.body.centerId || req.body.center);

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
    password,  
    email,
    role,
    employeeId,
    centerId: role === "admin" ? null : centerId,
    passwordHash,
    isActive: true,
    center: finalCenter,
  });

  res.status(201).json({ data: user });
});

/** حذف مستخدم */
router.delete("/users/:id", requireAuth, allowRoles("admin"), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

router.get("/users", requireAuth, allowRoles("admin"), async (req, res) => {
  try {
    const filter: any = {};

    // فلترة حسب المركز (اختياري)
    const centerId = (req.query.centerId as string) || (req.query.center as string);
    if (centerId) filter.center = centerId;

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .populate("center", "name code"); // ✅ أهم سطر

    return res.json({ success: true, data: users });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
});

router.get("/users", requireAuth, allowRoles("admin"), async (req, res) => {
  try {
    const filter: any = {};

    const centerId = (req.query.centerId as string) || (req.query.center as string);
    if (centerId) filter.center = centerId;

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .populate("center", "name code ip"); // ✅ أضف ip هنا

    return res.json({ success: true, data: users });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
});











export default router;
