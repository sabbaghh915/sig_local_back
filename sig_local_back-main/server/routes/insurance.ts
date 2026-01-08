import { Router } from "express";
import { calculateInsurancePremium } from "../services/insuranceCalculator";
import { protect } from "../middleware/auth";

const router = Router();

router.post("/calculate", protect, async (req, res) => {
  try {
    const body: any = { ...(req.body || {}) };

    // ✅ Normalize INTERNAL
    if (body.insuranceType === "internal") {
      body.vehicleCode = body.vehicleCode ?? body.vehicleType ?? "";
      body.months = body.months ?? body.period ?? body.insuranceMonths ?? 12;

      body.classification =
        typeof body.classification === "string"
          ? String(body.classification) // خليها string مثل فرونتك
          : String(body.classification ?? "");

      // optional services (internal only)
      body.electronicCard = body.electronicCard ?? body.services?.electronicCard ?? false;
      body.premiumService = body.premiumService ?? body.services?.premiumService ?? false;
      body.rescueService = body.rescueService ?? body.services?.rescueService ?? false;
    }

    // ✅ Normalize BORDER
    if (body.insuranceType === "border") {
      body.borderVehicleType = body.borderVehicleType ?? body.borderType ?? "";
      body.months = body.months ?? body.borderPeriod ?? body.insuranceMonths ?? 12;
    }

    // ✅ احسب (لازم تكون async إذا تقرأ من DB)
    const result = await calculateInsurancePremium(body);

    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.status(400).json({
      success: false,
      message: e?.message || "فشل الحساب",
    });
  }
});

export default router;
