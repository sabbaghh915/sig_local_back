import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../types/AuthRequest";
import User from "../models/User";
import { getClientIp } from "../utils/getClientIp";

const TOUCH_EVERY_MS = 60_000; // تحديث كل دقيقة كحد أقصى

export async function touchPresence(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    if (!req.user?._id) return next();

    const user = req.user as any;
    const now = Date.now();
    const last = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;

    if (!last || now - last >= TOUCH_EVERY_MS) {
      const ip = getClientIp(req);

      await User.updateOne(
        { _id: user._id },
        { $set: { lastSeenAt: new Date(now), lastSeenIp: ip } }
      ).exec();

      // تحديث نسخة req.user (اختياري)
      user.lastSeenAt = new Date(now);
      user.lastSeenIp = ip;
    }
  } catch (e) {
    // لا تمنع الطلب بسبب presence
    console.error("touchPresence error:", e);
  }
  next();
}
