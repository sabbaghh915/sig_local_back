import { Router } from "express";
import { calculateInsurancePremium } from "../services/insuranceCalculator";

const router = Router();

router.post("/calculate", (req, res) => {
  try {
    const body: any = { ...(req.body || {}) };

    // Normalize INTERNAL
    if (body.insuranceType === "internal") {
      body.vehicleType = body.vehicleType ?? body.vehicleCode;
      body.period = body.period ?? body.months;
      body.classification =
        typeof body.classification === "string"
          ? Number(body.classification)
          : body.classification;
    }

    // Normalize BORDER
    if (body.insuranceType === "border") {
      body.borderType = body.borderType ?? body.borderVehicleType;
      body.borderPeriod = body.borderPeriod ?? body.months ?? body.insuranceMonths;
    }

    const result = calculateInsurancePremium(body);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err?.message || "Bad Request",
    });
  }
});

export default router;
