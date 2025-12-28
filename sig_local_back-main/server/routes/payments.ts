import { Router, Response } from "express";
import mongoose from "mongoose";
import Payment from "../models/Payment";
import SyrianVehicle from "../models/SyrianVehicle";
import ForeignVehicle from "../models/ForeignVehicle";
import { protect, AuthRequest } from "../middleware/auth";
import InsuranceCompany from "../models/InsuranceCompany";
import FinanceBreakdown from "../models/FinanceBreakdown";
import { requireRole, requirePermission } from "../middleware/permissions";


const router = Router();

const generateReceiptNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `RCP-${timestamp}-${random}`;
};

// ✅ مهم جداً: تدعم ObjectId الحقيقي + string + object فيه _id
const normalizeObjectId = (v: any): string | null => {
  if (!v) return null;

  // إذا كان ObjectId أو شيء mongoose يعتبره ObjectId صالح
  if (mongoose.isValidObjectId(v)) return String(v);

  if (typeof v === "string") return v;

  if (typeof v === "object") {
    if (mongoose.isValidObjectId(v._id)) return String(v._id);
    if (mongoose.isValidObjectId(v.id)) return String(v.id);
  }

  return null;
};

const n = (v: any) => Number(v ?? 0) || 0;

function pickCompanyWeighted(companies: any[]) {
  const active = companies.filter((c) => c.isActive && Number(c.sharePercent) > 0);
  const total = active.reduce((a, c) => a + Number(c.sharePercent || 0), 0);
  if (!active.length || total <= 0) return null;

  const r = Math.random() * total;
  let acc = 0;
  for (const c of active) {
    acc += Number(c.sharePercent || 0);
    if (r <= acc) return c;
  }
  return active[active.length - 1];
}

// @route   POST /api/payments
// @desc    Create payment + update vehicle.pricing + upsert finance_breakdowns
// @access  Private
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const {
      vehicleId: rawVehicleId,
      policyNumber,
      amount,
      paymentMethod,
      paidBy,
      payerPhone,
      notes,
      pricingInput,
    } = req.body;

    const vehicleId = normalizeObjectId(rawVehicleId);

    if (!vehicleId || !mongoose.isValidObjectId(vehicleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vehicleId",
        received: rawVehicleId,
      });
    }

    // ✅ ابحث في السوري ثم الأجنبي
    let vehicle: any = await SyrianVehicle.findById(vehicleId);
    let vehicleModel: "SyrianVehicle" | "ForeignVehicle" = "SyrianVehicle";

    if (!vehicle) {
      vehicle = await ForeignVehicle.findById(vehicleId);
      vehicleModel = "ForeignVehicle";
    }

    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Vehicle not found" });
    }
    console.log("content-type:", req.headers["content-type"]);
console.log("body keys:", Object.keys(req.body || {}));
console.log("breakdown:", req.body?.breakdown);
console.log("quote:", req.body?.quote);
console.log("pricingInput.quote:", req.body?.pricingInput?.quote);


    // ✅ 1) اجلب breakdown/quote من أي مكان ممكن
    let raw: any =
      req.body.breakdown ??
      req.body.quote ??
      req.body?.pricingInput?.breakdown ??
      req.body?.pricingInput?.quote ??
      vehicle?.pricing?.quote ??           // ✅ fallback
  vehicle?.pricing?.breakdown ??
      null;

    // ✅ دعم FormData: إذا جاء كنص JSON
    if (typeof raw === "string") {
  try { raw = JSON.parse(raw); } catch {}
}

if (!raw || typeof raw !== "object") {
  return res.status(400).json({
    success: false,
    message:
      "breakdown أو quote مطلوب. (لا يوجد breakdown في الطلب ولا في vehicle.pricing.quote)",
  });
}

    // ✅ 2) ابنِ b (تفصيل الرسوم) قبل أي استخدام
    const b: any = {
      stampFee: n(raw.stampFee ?? raw.stamp ?? raw.stamp_base),
      warEffort: n(raw.warEffort ?? raw.war ?? raw.warFee),
      martyrFund: n(raw.martyrFund ?? raw.martyr ?? raw.martyrFee),
      localAdministration: n(raw.localAdministration ?? raw.local ?? raw.localFee),
      reconstruction: n(raw.reconstruction ?? raw.recon ?? raw.proposed ?? raw.proposedFee),
      agesFee: n(raw.agesFee ?? raw.ages ?? raw.ageFee),
      federationFee: n(raw.federationFee ?? raw.unionFee ?? raw.sifFee),
      total: n(raw.total ?? amount),
      netPremium: n(raw.netPremium ?? raw.net ?? raw.companyShare),
    };

    // ✅ إذا netPremium غير مرسل، احسبه من total - الرسوم
    if (!b.netPremium) {
      const fees =
        b.stampFee +
        b.warEffort +
        b.martyrFund +
        b.localAdministration +
        b.agesFee +
        b.reconstruction +
        b.federationFee;

      b.netPremium = Math.max(0, b.total - fees);
    }

    // ✅ حدث pricing داخل المركبة (اختياري لكنه ممتاز للـ PDF)
    if (pricingInput && typeof pricingInput === "object") {
      const nextPricing: any = {
        ...(vehicle.pricing?.toObject?.() ?? vehicle.pricing ?? {}),
        ...pricingInput,
      };

      nextPricing.quote = b; // ✅ نفس breakdown
      vehicle.pricing = nextPricing;
      await vehicle.save();
    }

    // ✅ center + processedBy من المستخدم المسجل
    const centerId = normalizeObjectId(req.user?.center);
    const processedById = normalizeObjectId(req.user?._id ?? req.user?.id);

    const center =
      centerId && mongoose.isValidObjectId(centerId) ? new mongoose.Types.ObjectId(centerId) : null;

    const processedBy =
      processedById && mongoose.isValidObjectId(processedById) ? new mongoose.Types.ObjectId(processedById) : null;

    // ✅ اختر شركة تأمين حسب الحصص
    const companies = await InsuranceCompany.find({ isActive: true }).select("_id sharePercent isActive");
    const picked = pickCompanyWeighted(companies);

    const amountNum = n(amount);

    const payment = await Payment.create({
      vehicleId,
      vehicleModel,
      policyNumber,
      amount: amountNum,
      paymentMethod,
      paidBy,
      payerPhone,
      notes,

      receiptNumber: generateReceiptNumber(),
      paymentStatus: "completed",

      processedBy,
      center,
      insuranceCompany: picked?._id || null,

      pricingInput: pricingInput ?? undefined,
      breakdown: b, // ✅ خزّن نفس التفصيل
    });

    // ✅ تطبيع القيم قبل تخزينها في finance_breakdowns
    const pCenterId = normalizeObjectId(payment.center);
    const pCompanyId = normalizeObjectId(payment.insuranceCompany);

    await FinanceBreakdown.updateOne(
      { paymentId: payment._id },
      {
        $set: {
          paymentId: payment._id,
          policyNumber: payment.policyNumber,

          centerId:
            pCenterId && mongoose.isValidObjectId(pCenterId) ? new mongoose.Types.ObjectId(pCenterId) : null,

          insuranceCompanyId:
            pCompanyId && mongoose.isValidObjectId(pCompanyId) ? new mongoose.Types.ObjectId(pCompanyId) : null,

          netPremium: b.netPremium,
          stampFee: b.stampFee,
          warEffort: b.warEffort,
          martyrFund: b.martyrFund,
          localAdministration: b.localAdministration,
          agesFee: b.agesFee,
          reconstruction: b.reconstruction,
          federationFee: b.federationFee,

          total: b.total,
          createdAt: payment.createdAt,
        },
      },
      { upsert: true }
    );

    return res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Create payment error:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// @route   GET /api/payments
// @access  Private
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, populate } = req.query as any;

    const query: any = {};
    if (status) query.paymentStatus = status;

    if (search) {
      query.$or = [
        { receiptNumber: { $regex: search, $options: "i" } },
        { policyNumber: { $regex: search, $options: "i" } },
        { paidBy: { $regex: search, $options: "i" } },
      ];
    }

    const q = Payment.find(query).sort({ createdAt: -1 });

    if (String(populate) === "1") {
      q.populate("vehicleId"); // ✅ يعمل مع refPath
      q.populate("processedBy", "username fullName");
      q.populate("insuranceCompany", "name"); // ✅ مفيد للواجهة
      q.populate("center", "name code ip province"); // ✅ مفيد للواجهة
    }

    const payments = await q.lean();

    const normalized = payments.map((p: any) => {
      const v = p.vehicleId;
      return {
        ...p,
        vehicle: typeof v === "object" ? v : undefined,
        vehicleId: typeof v === "object" ? String(v._id) : String(v),
      };
    });

    res.status(200).json({ success: true, count: normalized.length, data: normalized });
  } catch (error: any) {
    console.error("Get payments error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

// @route   GET /api/payments/:id
// @access  Private
router.get("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid payment id", received: id });
    }

    const payment = await Payment.findById(id)
      .populate("vehicleId")
      .populate("processedBy", "username fullName")
      .populate("insuranceCompany", "name")
      .populate("center", "name code ip province")
      .lean();

    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    const v: any = (payment as any).vehicleId;
    const normalized = {
      ...(payment as any),
      vehicle: typeof v === "object" ? v : undefined,
      vehicleId: typeof v === "object" ? String(v._id) : String(v),
    };

    res.status(200).json({ success: true, data: normalized });
  } catch (error: any) {
    console.error("Get payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

router.get(
  "/",
  protect,
  requireRole("admin", "assistant_admin"),
  requirePermission("view_payments"),
  
);


export default router;
