import express from "express";
import CarColor from "../models/CarColor";
import CarModel from "../models/CarModel";

const router = express.Router();

// GET /api/meta/colors
router.get("/colors", async (_req, res) => {
  try {
    const rows = await CarColor.find({ isActive: true })
      .sort({ name: 1 })
      .select("_id name legacyId")
      .lean();

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to load car colors" });
  }
});

// GET /api/meta/makes
router.get("/makes", async (_req, res) => {
  try {
    const makes = await CarModel.distinct("make", { isActive: true });
    makes.sort((a, b) => a.localeCompare(b, "ar"));
    res.json(makes);
  } catch (e) {
    res.status(500).json({ message: "Failed to load makes" });
  }
});

// GET /api/meta/models?make=KIA
router.get("/models", async (req, res) => {
  try {
    const make = String(req.query.make || "").trim();
    const filter: any = { isActive: true };
    if (make) filter.make = make;

    const rows = await CarModel.find(filter)
      .sort({ type: 1 })
      .select("_id make type legacyId")
      .lean();

    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to load models" });
  }
});

export default router;
