import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import User from "../models/User";

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

export default router;
