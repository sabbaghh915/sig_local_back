import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import FinanceCenterTotal from "../models/FinanceCenterTotal";
import Payment from "../models/Payment"; 
import { requireRole, requirePermission } from "../middleware/permissions";




const router = Router();

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

// helper لتحديد الفترة
const parseRange = (req: any) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  // نهاية اليوم
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

// ✅ 1) عرض الإحصائيات (بدون تخزين)
router.get("/centers", protect, authorize("admin"), async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? endOfDay(new Date(String(req.query.to))) : endOfDay(new Date());

  // ✅ استخدام paymentDate لأن عندك موجود
  const match: any = { paymentDate: { $gte: from, $lte: to } };

  // لو بدك فلترة مركز محدد من dropdown
  if (req.query.centerId) match.center = String(req.query.centerId);

  const rows = await Payment.aggregate([
    { $match: match },

    // ✅ لو بعض الدفعات القديمة ما فيها center: نجيبه من processedBy عبر lookup users
    {
      $lookup: {
        from: "users",
        localField: "processedBy",
        foreignField: "_id",
        as: "procUser",
      },
    },
    { $unwind: { path: "$procUser", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        centerResolved: { $ifNull: ["$center", "$procUser.center"] },
        amountResolved: { $ifNull: ["$amount", "$breakdown.total"] },
      },
    },

    {
      $group: {
        _id: "$centerResolved",
        totalAmount: { $sum: "$amountResolved" },
        paymentsCount: { $sum: 1 },
      },
    },

    // center info
    {
      $lookup: {
        from: "centers",
        localField: "_id",
        foreignField: "_id",
        as: "center",
      },
    },
    { $unwind: { path: "$center", preserveNullAndEmptyArrays: true } },

    {
      $project: {
        centerId: "$_id",
        totalAmount: 1,
        paymentsCount: 1,
        centerName: "$center.name",
        centerCode: "$center.code",
        centerIp: "$center.ip",
        province: "$center.province",
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  const grandTotal = rows.reduce((a: number, r: any) => a + (r.totalAmount || 0), 0);
  const grandCount = rows.reduce((a: number, r: any) => a + (r.paymentsCount || 0), 0);

  res.json({ success: true, from, to, grandTotal, grandCount, data: rows });
});


// ✅ 2) إعادة حساب + حفظ في DB (Upsert)
router.post("/centers/rebuild", protect, authorize("admin"), async (req, res) => {
  const from = req.body?.from ? new Date(req.body.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.body?.to ? endOfDay(new Date(req.body.to)) : endOfDay(new Date());

  const rows = await Payment.aggregate([
    { $match: { paymentDate: { $gte: from, $lte: to } } },
    {
      $lookup: {
        from: "users",
        localField: "processedBy",
        foreignField: "_id",
        as: "procUser",
      },
    },
    { $unwind: { path: "$procUser", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        centerResolved: { $ifNull: ["$center", "$procUser.center"] },
        amountResolved: { $ifNull: ["$amount", "$breakdown.total"] },
      },
    },
    {
      $group: {
        _id: "$centerResolved",
        totalAmount: { $sum: "$amountResolved" },
        paymentsCount: { $sum: 1 },
      },
    },
  ]);

  const ops = rows
    .filter((r: any) => r._id) // تجاهل العمليات بدون مركز
    .map((r: any) => ({
      updateOne: {
        filter: { center: r._id, from, to },
        update: {
          $set: {
            totalAmount: r.totalAmount || 0,
            paymentsCount: r.paymentsCount || 0,
            generatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

  if (ops.length) await FinanceCenterTotal.bulkWrite(ops);

  res.json({ success: true, saved: ops.length, from, to });
});

// ✅ 3) قراءة النتائج المخزنة (للعرض السريع)
router.get("/centers/saved", protect, authorize("admin"), async (req, res) => {
  const { from, to } = parseRange(req);

  const items = await FinanceCenterTotal.find({ from, to })
    .populate("center", "name code ip province")
    .sort({ totalAmount: -1 });

  res.json({ success: true, from, to, data: items });
});





export default router;
