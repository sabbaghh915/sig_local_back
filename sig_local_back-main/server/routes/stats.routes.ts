// server/routes/stats.routes.ts
import { Router, Response } from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/auth"; // عدّل المسار حسب مشروعك
import type { AuthRequest } from "../middleware/auth"; // إذا عندك النوع

import SyrianVehicle from "../models/SyrianVehicle";   // عدّل
import ForeignVehicle from "../models/ForeignVehicle"; // عدّل

const router = Router();

type Stats = {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  totalPremium: number;
};

const EMPTY: Stats = { total: 0, active: 0, expired: 0, cancelled: 0, totalPremium: 0 };

// ✅ هالدالة تعمل إحصائيات لأي Model
async function computeStats(Model: any, match: Record<string, any>): Promise<Stats> {
  const now = new Date();

  const result = await Model.aggregate([
    { $match: match },

    // ✅ نحاول نقرأ الحالة من status وإذا غير موجودة نحسبها من endDate
    {
      $addFields: {
        _computedStatus: {
          $ifNull: [
            "$status",
            {
              $cond: [
                { $lt: ["$endDate", now] },
                "expired",
                "active",
              ],
            },
          ],
        },

        // ✅ نحاول نقرأ قيمة القسط من أكثر من حقل (عدّل إذا عندك أسماء مختلفة)
        _premiumValue: {
          $ifNull: [
            "$premium",
            {
              $ifNull: [
                "$totalPremium",
                {
                  $ifNull: ["$amount", { $ifNull: ["$breakdown.total", 0] }],
                },
              ],
            },
          ],
        },
      },
    },

    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ["$_computedStatus", "active"] }, 1, 0] },
        },
        expired: {
          $sum: { $cond: [{ $eq: ["$_computedStatus", "expired"] }, 1, 0] },
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ["$_computedStatus", "cancelled"] }, 1, 0] },
        },
        totalPremium: { $sum: "$_premiumValue" },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return (result?.[0] as Stats) ?? EMPTY;
}

router.get("/records", protect, async (req: AuthRequest, res: Response) => {
  try {
    // ✅ فلترة حسب المركز إذا الموظف لازم يشوف مركزه فقط
    const matchByCenter: any = {};
    const user = (req as any).user;

    // عدّل حسب نظام الصلاحيات عندك
    if (user?.role === "employee" && user?.centerId && mongoose.isValidObjectId(user.centerId)) {
      matchByCenter.centerId = new mongoose.Types.ObjectId(user.centerId);
    }

    const [syrian, foreign] = await Promise.all([
      computeStats(SyrianVehicle, matchByCenter),
      computeStats(ForeignVehicle, matchByCenter),
    ]);

    return res.json({
      success: true,
      data: { syrian, foreign },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
});

export default router;
