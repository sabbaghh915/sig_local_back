import { Router } from "express";
import { calculateInsurancePremium } from "../services/insuranceCalculator";

const router = Router();

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

export default router;
