import mongoose from "mongoose";
import FinanceBreakdown from "../models/FinanceBreakdown";


const Payment = mongoose.model("Payment"); // تأكد اسم الموديل عندك
// collections names: centers, insurancecompanies (حسب اللي عندك فعلياً)

const toDateRange = (from: string, to: string) => {
  const fromDate = new Date(from + "T00:00:00.000Z");
  const toDate = new Date(to + "T23:59:59.999Z");
  return { fromDate, toDate };
};

const num = (expr: any) => ({
  $convert: { input: expr, to: "double", onError: 0, onNull: 0 },
});

const coalesce = (paths: any[]) =>
  paths.reduceRight((acc, p) => ({ $ifNull: [p, acc] }), 0);

export const getFinanceBreakdownByCenter = async (req: any, res: any) => {
  const { from, to, centerId } = req.query;
  const fromDate = new Date(from + "T00:00:00.000Z");
  const toDate = new Date(to + "T23:59:59.999Z");

  const match: any = { createdAt: { $gte: fromDate, $lte: toDate } };
  if (centerId) match.centerId = new mongoose.Types.ObjectId(centerId);

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        stateShare: {
          $add: ["$stampFee", "$warEffort", "$martyrFund", "$localAdministration", "$agesFee", "$reconstruction"],
        },
        companyShare: "$netPremium",
      },
    },
    {
      $facet: {
        data: [
          {
            $group: {
              _id: "$centerId",
              paymentsCount: { $sum: 1 },
              totalAmount: { $sum: "$total" },

              stampTotal: { $sum: "$stampFee" },
              warTotal: { $sum: "$warEffort" },
              martyrTotal: { $sum: "$martyrFund" },
              localTotal: { $sum: "$localAdministration" },
              agesTotal: { $sum: "$agesFee" },
              proposedTotal: { $sum: "$reconstruction" },

              stateShareTotal: { $sum: "$stateShare" },
              federationTotal: { $sum: "$federationFee" },
              companyShareTotal: { $sum: "$companyShare" },
            },
          },
          { $lookup: { from: "centers", localField: "_id", foreignField: "_id", as: "center" } },
          { $unwind: { path: "$center", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              centerId: "$_id",
              centerName: "$center.name",
              centerCode: "$center.code",
              centerIp: "$center.ip",
              province: "$center.province",

              paymentsCount: 1,
              totalAmount: 1,

              stampTotal: 1,
              warTotal: 1,
              martyrTotal: 1,
              localTotal: 1,
              agesTotal: 1,
              proposedTotal: 1,

              stateShareTotal: 1,
              federationTotal: 1,
              companyShareTotal: 1,
            },
          },
          { $sort: { totalAmount: -1 } },
        ],
        grand: [
          {
            $group: {
              _id: null,
              grandTotal: { $sum: "$total" },
              grandCount: { $sum: 1 },
              stampTotal: { $sum: "$stampFee" },
              warTotal: { $sum: "$warEffort" },
              martyrTotal: { $sum: "$martyrFund" },
              localTotal: { $sum: "$localAdministration" },
              agesTotal: { $sum: "$agesFee" },
              proposedTotal: { $sum: "$reconstruction" },
              stateShareTotal: { $sum: "$stateShare" },
              federationTotal: { $sum: "$federationFee" },
              companyShareTotal: { $sum: "$netPremium" },
            },
          },
          { $project: { _id: 0 } },
        ],
      },
    },
    {
      $project: {
        success: { $literal: true },
        from: { $literal: from },
        to: { $literal: to },
        data: "$data",
        grand: { $ifNull: [{ $arrayElemAt: ["$grand", 0] }, {}] },
      },
    },
  ];

  const out = await FinanceBreakdown.aggregate(pipeline);
  res.json(out?.[0] || { success: true, from, to, data: [], grand: {} });
};


 export const getFinanceDistributionByCompany = async (req: any, res: any) => {
  try {
    const { from, to, centerId } = req.query as { from: string; to: string; centerId?: string };
    if (!from || !to) return res.status(400).json({ success: false, message: "from/to مطلوبين" });

    const { fromDate, toDate } = toDateRange(from, to);

    const match: any = {
      createdAt: { $gte: fromDate, $lte: toDate },
      // paymentStatus: "completed",
    };

    if (centerId) {
      match.$or = [
        { centerId: new mongoose.Types.ObjectId(centerId) },
        { center: new mongoose.Types.ObjectId(centerId) },
        { centerId: centerId },
        { center: centerId },
      ];
    }

    const pipeline: any[] = [
      { $match: match },
      {
        $addFields: {
          amountNum: num(coalesce(["$amount", "$totalAmount", 0])),
          insuranceCompanyIdNorm: coalesce([
            "$insuranceCompanyId",
            "$companyId",
            "$insuranceCompany",
            "$insurance_company_id",
            null,
          ]),

          martyrFee: num(coalesce(["$breakdown.martyr", "$breakdown.martyrFee", "$quote.martyr", 0])),
          warFee: num(coalesce(["$breakdown.war", "$breakdown.warFee", "$quote.war", 0])),
          stampFee: num(coalesce(["$breakdown.stamp", "$breakdown.stampFee", "$breakdown.stamp_base", "$quote.stamp", 0])),
          agesFee: num(coalesce(["$breakdown.ages", "$breakdown.ageFee", "$breakdown.adminFee", "$quote.ages", 0])),
          localFee: num(coalesce(["$breakdown.local", "$breakdown.localFee", "$quote.local", 0])),
          proposedFee: num(coalesce(["$breakdown.proposed", "$breakdown.proposedFee", "$breakdown.recon", "$quote.proposed", 0])),
          federationFee: num(coalesce(["$breakdown.federationFee", "$breakdown.unionFee", "$breakdown.sifFee", "$quote.federationFee", 0])),
        },
      },
      {
        $addFields: {
          stateShare: { $add: ["$martyrFee", "$warFee", "$stampFee", "$agesFee", "$localFee", "$proposedFee"] },
          companyShare: { $subtract: ["$amountNum", { $add: ["$federationFee", "$stateShare"] }] },
        },
      },
      {
        $facet: {
          data: [
            {
              $group: {
                _id: "$insuranceCompanyIdNorm",
                paymentsCount: { $sum: 1 },
                totalAmount: { $sum: "$amountNum" },

                martyrTotal: { $sum: "$martyrFee" },
                warTotal: { $sum: "$warFee" },
                stampTotal: { $sum: "$stampFee" },
                agesTotal: { $sum: "$agesFee" },
                localTotal: { $sum: "$localFee" },
                proposedTotal: { $sum: "$proposedFee" },

                stateShareTotal: { $sum: "$stateShare" },
                federationTotal: { $sum: "$federationFee" },
                companyShareTotal: { $sum: "$companyShare" },
              },
            },
            {
              $lookup: {
                from: "insurancecompanies",
                localField: "_id",
                foreignField: "_id",
                as: "company",
              },
            },
            { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                insuranceCompanyId: "$_id",
                insuranceCompanyName: { $ifNull: ["$company.name", "غير محدد"] },

                paymentsCount: 1,
                totalAmount: 1,

                martyrTotal: 1,
                warTotal: 1,
                stampTotal: 1,
                agesTotal: 1,
                localTotal: 1,
                proposedTotal: 1,

                stateShareTotal: 1,
                federationTotal: 1,
                companyShareTotal: 1,
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
          grand: [
            {
              $group: {
                _id: null,
                grandTotal: { $sum: "$amountNum" },
                grandCount: { $sum: 1 },
                stateShareTotal: { $sum: "$stateShare" },
                federationTotal: { $sum: "$federationFee" },
                companyShareTotal: { $sum: "$companyShare" },
              },
            },
            { $project: { _id: 0 } },
          ],
        },
      },
      {
        $project: {
          success: { $literal: true },
          from: { $literal: from },
          to: { $literal: to },
          data: "$data",
          grand: { $ifNull: [{ $arrayElemAt: ["$grand", 0] }, {}] },
        },
      },
    ];

    const out = await Payment.aggregate(pipeline);
    return res.json(out?.[0] || { success: true, from, to, data: [], grand: {} });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
};

export const rebuildFinanceByCenter = async (req: any, res: any) => {
  try {
    const { from, to } = req.body as { from: string; to: string };
    if (!from || !to) return res.status(400).json({ success: false, message: "from/to مطلوبين" });

    const fromDate = new Date(from + "T00:00:00.000Z");
    const toDate = new Date(to + "T23:59:59.999Z");

    const match: any = { createdAt: { $gte: fromDate, $lte: toDate } };

    // ✅ نجمع ونحفظ النتائج في financecentertotals (إذا كنت تستخدمه)
    // إذا أنت لا تستخدم financecentertotals حالياً احذف جزء الحفظ وخليه يرجع فقط النتائج.

    const FinanceCenterTotals =
      mongoose.models.FinanceCenterTotals || mongoose.model("FinanceCenterTotals");

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: "$centerId",
          totalAmount: { $sum: "$total" },
          paymentsCount: { $sum: 1 },

          stampTotal: { $sum: "$stampFee" },
          warTotal: { $sum: "$warEffort" },
          martyrTotal: { $sum: "$martyrFund" },
          localTotal: { $sum: "$localAdministration" },
          agesTotal: { $sum: "$agesFee" },
          proposedTotal: { $sum: "$reconstruction" },

          federationTotal: { $sum: "$federationFee" },
          companyShareTotal: { $sum: "$netPremium" },
        },
      },
    ];

    const rows = await FinanceBreakdown.aggregate(pipeline);

    // ✅ upsert لكل مركز (اختياري)
    for (const r of rows) {
      await FinanceCenterTotals.updateOne(
        { centerId: r._id, from, to },
        {
          $set: {
            centerId: r._id,
            from,
            to,
            totalAmount: r.totalAmount || 0,
            paymentsCount: r.paymentsCount || 0,

            stampTotal: r.stampTotal || 0,
            warTotal: r.warTotal || 0,
            martyrTotal: r.martyrTotal || 0,
            localTotal: r.localTotal || 0,
            agesTotal: r.agesTotal || 0,
            proposedTotal: r.proposedTotal || 0,

            federationTotal: r.federationTotal || 0,
            companyShareTotal: r.companyShareTotal || 0,

            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    return res.json({ success: true, from, to, count: rows.length });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
};
