import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import InsuranceCompany from "../models/InsuranceCompany";
import Payment from "../models/Payment";
import { getInsuranceCompanyPayments } from "../controllers/adminInsuranceCompanies.controller";
import { getFinanceDistributionByCompany } from "../controllers/adminFinance.controller";


const router = Router();
console.log("✅ insurance-companies routes LOADED");


const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

// ✅ List companies
router.get("/", protect, authorize("admin"), async (_req, res) => {
  const items = await InsuranceCompany.find().sort({ name: 1 });
  res.json({ success: true, data: items });
});

// ✅ Create company
router.post("/", protect, authorize("admin"), async (req, res) => {
  const { name, sharePercent = 0, isActive = true } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: "اسم الشركة مطلوب" });
  }
  if (Number(sharePercent) < 0 || Number(sharePercent) > 100) {
    return res.status(400).json({ success: false, message: "الحصة يجب أن تكون بين 0 و 100" });
  }

  const created = await InsuranceCompany.create({
    name: name.trim(),
    sharePercent: Number(sharePercent),
    isActive: Boolean(isActive),
  });

  res.json({ success: true, data: created });
});

// ✅ Update company (share/name/active)
router.put("/:id", protect, authorize("admin"), async (req, res) => {
  const { id } = req.params;
  const patch: any = {};

  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

  if (req.body.sharePercent !== undefined) {
    const sp = Number(req.body.sharePercent);
    if (!Number.isFinite(sp) || sp < 0 || sp > 100) {
      return res.status(400).json({ success: false, message: "الحصة يجب أن تكون بين 0 و 100" });
    }
    patch.sharePercent = sp;
  }

  const updated = await InsuranceCompany.findByIdAndUpdate(id, patch, { new: true });
  if (!updated) return res.status(404).json({ success: false, message: "لم يتم العثور على الشركة" });

  res.json({ success: true, data: updated });
});

// ✅ Delete (اختياري) — الأفضل Soft Delete عبر isActive=false
router.delete("/:id", protect, authorize("admin"), async (req, res) => {
  const { id } = req.params;
  await InsuranceCompany.findByIdAndDelete(id);
  res.json({ success: true });
});

// ✅ Stats: عدد العقود + مجموع المبالغ لكل شركة ضمن فترة
// GET /api/admin/insurance-companies/stats?from=2025-12-01&to=2025-12-31
router.get("/stats", protect, authorize("admin"), async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? endOfDay(new Date(String(req.query.to))) : endOfDay(new Date());

  // ✅ نعتمد paymentDate لأنك تستخدمه
  const match: any = {
    paymentStatus: "completed",
    paymentDate: { $gte: from, $lte: to },
  };

  const agg = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$insuranceCompany",
        contractsCount: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  // ندمج النتائج مع قائمة الشركات حتى تظهر الشركات التي لديها 0
  const companies = await InsuranceCompany.find().sort({ name: 1 });

  const map = new Map<string, any>();
  for (const r of agg) map.set(String(r._id || "null"), r);

  const data = companies.map((c) => {
    const r = map.get(String(c._id)) || { contractsCount: 0, totalAmount: 0 };
    return {
      companyId: c._id,
      name: c.name,
      sharePercent: c.sharePercent,
      isActive: c.isActive,
      contractsCount: r.contractsCount || 0,
      totalAmount: r.totalAmount || 0,
    };
  });

  // عقود غير موزعة (insuranceCompany = null)
  const unassigned = map.get("null") || { contractsCount: 0, totalAmount: 0 };

  res.json({
    success: true,
    from,
    to,
    data,
    unassigned: {
      contractsCount: unassigned.contractsCount || 0,
      totalAmount: unassigned.totalAmount || 0,
    },
  });
});

router.get("/insurance-companies/:id/payments", protect, authorize("admin"), getInsuranceCompanyPayments);

router.get("/finance/distribution", protect, authorize("admin"), getFinanceDistributionByCompany);

export default router;
