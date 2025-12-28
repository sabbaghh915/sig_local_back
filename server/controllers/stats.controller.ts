import { Request, Response } from "express";
import SyrianVehicle from "../models/SyrianVehicle";   // عدّل المسار/الاسم
import ForeignVehicle from "../models/ForeignVehicle"; // عدّل المسار/الاسم

type Stats = {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  totalPremium: number;
};

const EMPTY: Stats = { total: 0, active: 0, expired: 0, cancelled: 0, totalPremium: 0 };

function normalizeAgg(rows: any[]): Stats {
  const out: Stats = { ...EMPTY };

  for (const r of rows) {
    if (r?._id === "active") out.active = r.count || 0;
    if (r?._id === "expired") out.expired = r.count || 0;
    if (r?._id === "cancelled") out.cancelled = r.count || 0;
    out.totalPremium += r.totalPremium || 0;
  }

  out.total = out.active + out.expired + out.cancelled;
  return out;
}

export async function getRecordsStats(req: Request, res: Response) {
  try {
    const now = new Date();

    const pipeline = [
      {
        $addFields: {
          __status: {
            $switch: {
              branches: [
                { case: { $eq: ["$isCancelled", true] }, then: "cancelled" },
                { case: { $lt: ["$endDate", now] }, then: "expired" },
              ],
              default: "active",
            },
          },
          __premium: { $ifNull: ["$totalPremium", 0] },
        },
      },
      {
        $group: {
          _id: "$__status",
          count: { $sum: 1 },
          totalPremium: { $sum: "$__premium" },
        },
      },
    ];

    const [syrianAgg, foreignAgg] = await Promise.all([
      SyrianVehicle.aggregate(pipeline),
      ForeignVehicle.aggregate(pipeline),
    ]);

    const syrian = normalizeAgg(syrianAgg);
    const foreign = normalizeAgg(foreignAgg);

    return res.json({
      success: true,
      data: { syrian, foreign },
    });
  } catch (e: any) {
    return res.status(500).json({
      success: false,
      message: e?.message || "Server error",
    });
  }
}
