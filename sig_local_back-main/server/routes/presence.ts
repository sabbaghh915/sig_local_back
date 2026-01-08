import { Router } from "express";
import { protect } from "../middleware/auth"; // عندك
import type { AuthRequest } from "../types/AuthRequest";
import User from "../models/User";
import { getClientIp } from "../utils/getClientIp";

const router = Router();

// الفرونت يناديه كل 30-60 ثانية
router.post("/ping", protect, async (req: AuthRequest, res) => {
  const ip = getClientIp(req);
  const now = new Date();

  await User.updateOne(
    { _id: req.user!._id },
    { $set: { lastSeenAt: now, lastSeenIp: ip } }
  ).exec();

  res.json({ success: true, lastSeenAt: now });
});

export default router;
