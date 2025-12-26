import express from "express";
import { protect } from "../middleware/auth";
import { requireAuth, allowRoles } from "../middleware/auth";
import User from "../models/User";
import Center from "../models/Center";
import bcrypt from "bcryptjs";


const router = express.Router();

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






export default router;
