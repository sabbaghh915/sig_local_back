import { Router, Response } from "express";
import mongoose from "mongoose";
import Payment from "../models/Payment";
import SyrianVehicle from "../models/SyrianVehicle";
import ForeignVehicle from "../models/ForeignVehicle";
import { protect, AuthRequest } from "../middleware/auth";
import InsuranceCompany from "../models/InsuranceCompany";

const router = Router();

const generateReceiptNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `RCP-${timestamp}-${random}`;
};

const normalizeObjectId = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (typeof v._id === "string") return v._id;
    if (typeof v.id === "string") return v.id;
  }
  return null;
};

const safeNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeBreakdown = (q: any) =>
  q && typeof q === "object"
    ? {
        netPremium: safeNum(q.netPremium),
        stampFee: safeNum(q.stampFee),
        warEffort: safeNum(q.warEffort),
        martyrFund: safeNum(q.martyrFund),
        localAdministration: safeNum(q.localAdministration),
        reconstruction: safeNum(q.reconstruction),
        total: safeNum(q.total),
      }
    : undefined;

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
// @desc    Create payment + update vehicle.pricing
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
      quote,
      breakdown,
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

    // ✅ حدث pricing داخل المركبة (اختياري لكن ممتاز للـ PDF)
    if (pricingInput && typeof pricingInput === "object") {
      const nextPricing: any = {
        ...(vehicle.pricing?.toObject?.() ?? vehicle.pricing ?? {}),
        ...pricingInput,
      };

      const q = quote ?? breakdown;
      const bd = normalizeBreakdown(q);
      if (bd) nextPricing.quote = bd;

      vehicle.pricing = nextPricing;
      await vehicle.save();
    }

    const bd = normalizeBreakdown(quote ?? breakdown);

    // ✅ center + processedBy من المستخدم المسجل
    const center = req.user?.center ?? null;          // User schema عندك فيه center
    const processedBy = req.user?._id ?? req.user?.id; // الأفضل ObjectId

    // ✅ اختر شركة تأمين حسب الحصص (اختياري)
    const companies = await InsuranceCompany.find({ isActive: true }).select("_id sharePercent isActive");
    const picked = pickCompanyWeighted(companies);

    const payment = await Payment.create({
      vehicleId,
      vehicleModel,
      policyNumber,
      amount,
      paymentMethod,
      paidBy,
      payerPhone,
      notes,

      receiptNumber: generateReceiptNumber(),
      paymentStatus: "completed",

      processedBy,         // ✅ مهم
      center,              // ✅ مهم (للسجلات حسب المركز + المالية)
      insuranceCompany: picked?._id || null, // ✅ توزيع الشركات

      pricingInput: pricingInput ?? undefined,
      breakdown: bd ?? undefined,
    });

    return res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Create payment error:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});


// @route   GET /api/payments
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
      q.populate("vehicleId"); // ✅ يعمل مع refPath (Syrian/Foreign)
      q.populate("processedBy", "username fullName");
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
router.get("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid payment id", received: id });
    }

    const payment = await Payment.findById(id)
      .populate("vehicleId") // ✅ refPath
      .populate("processedBy", "username fullName")
      .lean();

    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    const v: any = payment.vehicleId;
    const normalized = {
      ...payment,
      vehicle: typeof v === "object" ? v : undefined,
      vehicleId: typeof v === "object" ? String(v._id) : String(v),
    };

    res.status(200).json({ success: true, data: normalized });
  } catch (error: any) {
    console.error("Get payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

export default router;
