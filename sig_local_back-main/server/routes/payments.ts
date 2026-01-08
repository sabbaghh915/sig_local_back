// server/routes/payments.ts
import { Router, Response } from "express";
import mongoose from "mongoose";
import { protect } from "../middleware/auth";
import type { AuthRequest } from "../types/AuthRequest";

import Payment from "../models/Payment";
import SyrianVehicle from "../models/SyrianVehicle";
import ForeignVehicle from "../models/ForeignVehicle";
import InsuranceCompany from "../models/InsuranceCompany";
import FinanceBreakdown from "../models/FinanceBreakdown";

import { resolveCenterScope } from "../utils/tenant";
import { upsertRecordFromPayment } from "../utils/recordsSync";
import { calculateInsurancePremium } from "../services/insuranceCalculator";

const router = Router();

/** ===== Helpers ===== */
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function normalizeObjectId(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.$oid) return String(v.$oid);
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
  }
  return null;
}

function generateReceiptNumber() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RCP-${Date.now()}-${rand}`;
}

function pickCompanyWeighted(companies: any[]) {
  const list = (companies || []).filter((c) => c && c.isActive !== false);
  if (!list.length) return null;

  const total = list.reduce((sum, c) => sum + n(c.sharePercent || 0), 0);
  if (total <= 0) return list[Math.floor(Math.random() * list.length)];

  let r = Math.random() * total;
  for (const c of list) {
    r -= n(c.sharePercent || 0);
    if (r <= 0) return c;
  }
  return list[list.length - 1];
}

function normalizePricingInputAny(pi: any) {
  if (!pi || typeof pi !== "object") return null;
  const out: any = { ...pi };

  // internal
  if (out.insuranceType === "internal") {
    out.vehicleType = out.vehicleType ?? out.vehicleCode;
    out.period = out.period ?? out.months;
    out.classification =
      typeof out.classification === "string" ? Number(out.classification) : out.classification;
  }

  // border
  if (out.insuranceType === "border") {
    out.borderType = out.borderType ?? out.borderVehicleType;
    out.borderPeriod = out.borderPeriod ?? out.months ?? out.insuranceMonths;
  }

  return out;
}

const parseDate = (v: any): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
};

const monthsFromPricingInput = (pricingInput: any) => {
  const m = Number(pricingInput?.months);
  return Number.isFinite(m) && m > 0 ? m : 12;
};

/** ===== GET /api/payments ===== */
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, populate, showMine } = req.query as any;

    const query: any = {};

    // ✅ نطاق المركز (Tenant)
    const centerScope = resolveCenterScope(req);
    if (centerScope) query.center = centerScope; // لأن Payment عندك يستخدم field اسمها center

    // ✅ showMine=1
    if (String(showMine) === "1") query.processedBy = req.user!.id;

    // ✅ filter by payment status
    if (status) query.paymentStatus = status;

    // ✅ search
    if (search) {
      query.$or = [
        { receiptNumber: { $regex: search, $options: "i" } },
        { policyNumber: { $regex: search, $options: "i" } },
        { paidBy: { $regex: search, $options: "i" } },
        { payerPhone: { $regex: search, $options: "i" } },
      ];
    }

    const q = Payment.find(query).sort({ createdAt: -1 });

    if (String(populate) === "1") {
      q.populate("vehicleId"); // ✅ refPath
      q.populate("processedBy", "username fullName");
      q.populate("insuranceCompany", "name");
      q.populate("center", "name code ip province");
    }

    const payments = await q.lean();

    // ✅ normalize vehicleId + attach vehicle when populated
    const normalized = (payments || []).map((p: any) => {
      const v = p.vehicleId;
      return {
        ...p,
        vehicle: typeof v === "object" ? v : undefined,
        vehicleId: typeof v === "object" ? String(v._id) : String(v),
      };
    });

    return res.status(200).json({ success: true, count: normalized.length, data: normalized });
  } catch (error: any) {
    console.error("Get payments error:", error);
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
});

/** ===== POST /api/payments ===== */
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    // ✅ تجاهل receiptNumber القادم من الفرونت بالكامل
    if ((req.body as any)?.receiptNumber) delete (req.body as any).receiptNumber;

    const {
      vehicleId: rawVehicleId,
      policyNumber: rawPolicyNumber,
      paymentMethod,
      paidBy,
      payerPhone,
      notes,

      pricingInput,
      paymentStatus, // (غير مستخدم حالياً)

      policyStartAt,
      policyEndAt,
      issuedAt,
    } = req.body;

    const vehicleId = normalizeObjectId(rawVehicleId);

    if (!vehicleId || !mongoose.isValidObjectId(vehicleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vehicleId",
        received: rawVehicleId,
      });
    }

    if (!paymentMethod || !paidBy) {
      return res.status(400).json({
        success: false,
        message: "paymentMethod و paidBy مطلوبين",
      });
    }

    // ✅ policyNumber إن لم يُرسل
    const policyNumber =
      String(rawPolicyNumber || "").trim() ||
      `POL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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

    // ===== 1) حاول أخذ breakdown من أي مكان =====
    let raw: any =
      req.body?.breakdown ??
      req.body?.quote ??
      req.body?.pricingInput?.breakdown ??
      req.body?.pricingInput?.quote ??
      vehicle?.pricing?.quote ??
      vehicle?.pricing?.breakdown ??
      null;

    // ✅ إذا raw جاء كنص (FormData)
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {}
    }

    // ===== 2) إذا لم يصل breakdown -> احسبها من pricingInput داخل السيرفر =====
    const piToSave = normalizePricingInputAny(pricingInput ?? vehicle?.pricing);
    if (!raw) {
      if (piToSave) {
        const calc = calculateInsurancePremium(piToSave);
        raw = calc?.breakdown ?? null;
        if (raw && !raw.total) raw.total = calc.total;
      }
    }

    if (!raw || typeof raw !== "object") {
      return res.status(400).json({
        success: false,
        message: "breakdown/quote مطلوب أو pricingInput صالح لكي يتم الحساب داخل السيرفر",
      });
    }

    // ===== 3) خدمات إضافية (المصدر الصحيح هو pricingInput) =====
    const svcElectronic = Boolean(piToSave?.electronicCard ?? pricingInput?.electronicCard ?? false);
    const svcPremium = Boolean(piToSave?.premiumService ?? pricingInput?.premiumService ?? false);
    const svcRescue = Boolean(piToSave?.rescueService ?? pricingInput?.rescueService ?? false);

    // ===== 4) breakdown موحّد + booleans =====
    const b: any = {
      netPremium: n(raw.netPremium ?? raw.net ?? raw.companyShare),

      stampFee: n(raw.stampFee ?? raw.stamp ?? raw.stamp_base),
      warEffort: n(raw.warEffort ?? raw.war ?? raw.warFee),

      martyrFund: n(raw.martyrFund ?? raw.martyrStamp ?? raw.martyr ?? raw.martyrFee),
      localAdministration: n(raw.localAdministration ?? raw.localAdmin ?? raw.local ?? raw.localFee),

      reconstruction: n(raw.reconstruction ?? raw.recon ?? raw.reconFee),

      agesFee: n(raw.agesFee ?? raw.ages ?? raw.ageFee ?? 0),
      federationFee: n(raw.federationFee ?? raw.unionFee ?? raw.sifFee ?? 0),

      electronicCardFee: n(raw.electronicCardFee ?? 0),
      premiumServiceFee: n(raw.premiumServiceFee ?? 0),
      rescueServiceFee: n(raw.rescueServiceFee ?? 0),

      subtotal: n(raw.subtotal ?? 0),
      total: n(raw.total ?? 0),

      electronicCard: svcElectronic,
      premiumService: svcPremium,
      rescueService: svcRescue,
    };

    // ===== 5) رسوم الخدمات إذا لم تأت =====
    if (!b.electronicCardFee && svcElectronic) b.electronicCardFee = 15000;
    if (!b.premiumServiceFee && svcPremium) b.premiumServiceFee = 5000;
    if (!b.rescueServiceFee && svcRescue) b.rescueServiceFee = 3000;

    // ===== 6) subtotal إن لم يكن موجوداً =====
    if (!b.subtotal) {
      b.subtotal =
        b.netPremium +
        b.stampFee +
        b.warEffort +
        b.martyrFund +
        b.localAdministration +
        b.reconstruction +
        b.agesFee +
        b.federationFee;
    }

    // ===== 7) total إن لم يكن موجوداً =====
    if (!b.total) {
      b.total = b.subtotal + b.electronicCardFee + b.premiumServiceFee + b.rescueServiceFee;
    }

    // ===== 8) netPremium إن لم يكن موجوداً =====
    if (!b.netPremium) {
      const fees =
        b.stampFee +
        b.warEffort +
        b.martyrFund +
        b.localAdministration +
        b.reconstruction +
        b.agesFee +
        b.federationFee;

      b.netPremium = Math.max(0, b.subtotal - fees);
    }

    // ===== 9) amount دائماً = total =====
    const amountNum = b.total;

    // ===== 10) خزّن Snapshot في المركبة (ممتاز للـ PDF) =====
    if (piToSave) {
      const nextPricing: any = {
        ...(vehicle.pricing?.toObject?.() ?? vehicle.pricing ?? {}),
        ...piToSave,
      };

      nextPricing.electronicCard = svcElectronic;
      nextPricing.premiumService = svcPremium;
      nextPricing.rescueService = svcRescue;

      nextPricing.quote = b; // ✅ Snapshot
      vehicle.pricing = nextPricing;
      await vehicle.save();
    }

    // ===== 11) center + processedBy من المستخدم =====
    const centerId = normalizeObjectId((req.user as any)?.center ?? (req.user as any)?.centerId);
    const processedById = normalizeObjectId((req.user as any)?._id ?? (req.user as any)?.id);

    const center =
      centerId && mongoose.isValidObjectId(centerId) ? new mongoose.Types.ObjectId(centerId) : null;

    const processedBy =
      processedById && mongoose.isValidObjectId(processedById)
        ? new mongoose.Types.ObjectId(processedById)
        : null;

    if (!processedBy) {
      return res.status(400).json({ success: false, message: "processedBy missing/invalid" });
    }

    // ===== 12) اختر شركة تأمين حسب الحصص =====
    const companies = await InsuranceCompany.find({ isActive: true }).select(
      "_id sharePercent isActive"
    );
    const picked = pickCompanyWeighted(companies);

    // ===== 13) تواريخ البوليصة =====
    const issuedAtDate = parseDate(issuedAt) || new Date();
    const startAtDate = parseDate(policyStartAt) || issuedAtDate;
    const endAtDate =
      parseDate(policyEndAt) || addMonths(startAtDate, monthsFromPricingInput(piToSave ?? pricingInput));

    // ===== 14) أنشئ Payment (مرة واحدة فقط ✅) =====
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

      pricingInput: piToSave ?? pricingInput ?? undefined,
      breakdown: b,

      issuedAt: issuedAtDate,
      policyStartAt: startAtDate,
      policyEndAt: endAtDate,
    });

    // ✅ sync إلى policy_records
    await upsertRecordFromPayment(payment);

    // ===== 15) خزّن Breakdown في FinanceBreakdown =====
    const pCenterId = normalizeObjectId(payment.center);
    const pCompanyId = normalizeObjectId(payment.insuranceCompany);

    await FinanceBreakdown.updateOne(
      { paymentId: payment._id },
      {
        $set: {
          paymentId: payment._id,
          policyNumber: payment.policyNumber,

          centerId:
            pCenterId && mongoose.isValidObjectId(pCenterId)
              ? new mongoose.Types.ObjectId(pCenterId)
              : null,

          insuranceCompanyId:
            pCompanyId && mongoose.isValidObjectId(pCompanyId)
              ? new mongoose.Types.ObjectId(pCompanyId)
              : null,

          netPremium: b.netPremium,
          stampFee: b.stampFee,
          warEffort: b.warEffort,
          martyrFund: b.martyrFund,
          localAdministration: b.localAdministration,
          agesFee: b.agesFee,
          reconstruction: b.reconstruction,
          federationFee: b.federationFee,

          total: b.total,
          createdAt: (payment as any).createdAt,
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

/** ===== GET /api/payments/:id?populate=1 ===== */
router.get("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { populate } = req.query as any;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid payment id" });
    }

    const q = Payment.findById(id);

    if (String(populate) === "1") {
      q.populate("vehicleId"); // ✅ refPath يعمل
      q.populate("processedBy", "username fullName");
      q.populate("insuranceCompany", "name");
      q.populate("center", "name code ip province");
    }

    const payment = await q.lean();
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    const v: any = (payment as any).vehicleId;

    return res.json({
      success: true,
      data: {
        ...payment,
        vehicle: typeof v === "object" ? v : undefined,
        vehicleId: typeof v === "object" ? String(v._id) : String(v),
      },
    });
  } catch (err: any) {
    console.error("Get payment by id error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

export default router;
