import { Router } from "express";
import Center from "../models/Center";

const router = Router();

router.get("/centers/public", async (_req, res) => {
  const centers = await Center.find({ isActive: true })
    .select("name code ip province")
    .sort({ name: 1 });

  res.json({ success: true, data: centers });
});

export default router;
