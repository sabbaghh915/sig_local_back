import { Router } from "express";
import { calculateInsurancePremium } from "../services/insuranceCalculator";
import PricingConfig from "../models/PricingConfig";
import { protect } from "../middleware/auth";

const router = Router();

function mapToObj(m: any) {
  // mongoose Map
  if (m && typeof m.entries === "function") return Object.fromEntries(m.entries());
  // plain object
  if (m && typeof m === "object") return m;
  return {};
}

router.post("/calculate", (req, res) => {
  try {
    const quote = calculateInsurancePremium(req.body);
    return res.json({ success: true, data: quote });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err?.message || "Bad Request",
    });
  }
});


// ✅ GET /api/pricing/active
router.get("/active", protect, async (_req, res) => {
  try {
    const cfg = await PricingConfig.findOne().sort({ updatedAt: -1 });
    if (!cfg) {
      return res.status(404).json({ success: false, message: "لا يوجد تسعير محفوظ" });
    }

    return res.json({
      success: true,
      data: {
        internal: mapToObj((cfg as any).internal),
        border: mapToObj((cfg as any).border),
        internalMeta: mapToObj((cfg as any).internalMeta),
        borderMeta: mapToObj((cfg as any).borderMeta),
        version: (cfg as any).version ?? 1,
        updatedAt: (cfg as any).updatedAt,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
});

export default router;
