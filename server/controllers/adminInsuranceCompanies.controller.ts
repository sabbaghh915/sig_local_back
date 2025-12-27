import { Request, Response } from "express";
import mongoose from "mongoose";
import Payment from "../models/Payment";
import InsuranceCompany from "../models/InsuranceCompany";

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const getInsuranceCompanyPayments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "companyId غير صالح" });
    }

    const from = (req.query.from as string) || "";
    const to = (req.query.to as string) || "";

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;

    const fromDate = from ? new Date(from) : new Date("1970-01-01");
    const toDate = to ? endOfDay(new Date(to)) : endOfDay(new Date());

    const company = await InsuranceCompany.findById(id).lean();
    if (!company) return res.status(404).json({ message: "الشركة غير موجودة" });

    // ✅ دعم paidAt أو createdAt حسب بياناتك
    const dateRange = { $gte: fromDate, $lte: toDate };

    const match: any = {
      insuranceCompany: new mongoose.Types.ObjectId(id),
      paymentStatus: "completed",
      $or: [
        { paidAt: dateRange },
        { paidAt: { $exists: false }, createdAt: dateRange },
      ],
    };

    const [items, total, statsArr] = await Promise.all([
      Payment.find(match)
        .sort({ paidAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(match),
      Payment.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            contractsCount: { $sum: 1 },
            totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
      ]),
    ]);

    const stats = statsArr?.[0] || { contractsCount: 0, totalAmount: 0 };

    return res.json({
      company,
      stats,
      page,
      limit,
      total,
      items,
    });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "Server Error" });
  }
};
