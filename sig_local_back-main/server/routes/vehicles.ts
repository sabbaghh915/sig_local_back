import { Router, Response } from "express";
import mongoose from "mongoose";
import SyrianVehicle from "../models/SyrianVehicle";
import ForeignVehicle from "../models/ForeignVehicle";
import { protect, AuthRequest } from "../middleware/auth";

const router = Router();

const pickModel = (vehicleType?: string) => {
  return vehicleType === "foreign" ? ForeignVehicle : SyrianVehicle;
};

// CREATE
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const Model = pickModel(req.body.vehicleType);

    const vehicle = await Model.create({
      ...req.body,
      createdBy: req.user.id,
      pricing: req.body.pricing ?? { months: 12, quote: {} }, // تأمين required
    });

    res.status(201).json({ success: true, data: vehicle });
  } catch (e: any) {
    console.error("Create vehicle error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// LIST
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { vehicleType, status, search } = req.query as any;

    const buildQuery = () => {
      const q: any = {};
      if (status) q.status = status;

      if (search) {
        q.$or = [
          { plateNumber: { $regex: search, $options: "i" } },
          { ownerName: { $regex: search, $options: "i" } },
          { nationalId: { $regex: search, $options: "i" } },
        ];
      }
      return q;
    };

    const q = buildQuery();

    if (vehicleType === "foreign") {
      const items = await ForeignVehicle.find(q).populate("createdBy", "username fullName").sort({ createdAt: -1 });
      return res.json({ success: true, count: items.length, data: items });
    }

    if (vehicleType === "syrian") {
      const items = await SyrianVehicle.find(q).populate("createdBy", "username fullName").sort({ createdAt: -1 });
      return res.json({ success: true, count: items.length, data: items });
    }

    // بدون فلتر: رجّع الاثنين مع بعض
    const [sy, fr] = await Promise.all([
      SyrianVehicle.find(q).populate("createdBy", "username fullName"),
      ForeignVehicle.find(q).populate("createdBy", "username fullName"),
    ]);

    const merged = [...sy, ...fr].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ success: true, count: merged.length, data: merged });
  } catch (e: any) {
    console.error("Get vehicles error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// GET BY ID (يحاول بالـ Syrian ثم Foreign)
router.get("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid vehicle id" });
    }

    let vehicle = await SyrianVehicle.findById(id).populate("createdBy", "username fullName");
    if (!vehicle) vehicle = await ForeignVehicle.findById(id).populate("createdBy", "username fullName");

    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

    res.json({ success: true, data: vehicle });
  } catch (e: any) {
    console.error("Get vehicle error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// UPDATE
router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid vehicle id" });

    let updated = await SyrianVehicle.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!updated) updated = await ForeignVehicle.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

    if (!updated) return res.status(404).json({ success: false, message: "Vehicle not found" });

    res.json({ success: true, data: updated });
  } catch (e: any) {
    console.error("Update vehicle error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// DELETE
router.delete("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid vehicle id" });

    const sy = await SyrianVehicle.findById(id);
    if (sy) {
      await sy.deleteOne();
      return res.json({ success: true, data: {} });
    }

    const fr = await ForeignVehicle.findById(id);
    if (fr) {
      await fr.deleteOne();
      return res.json({ success: true, data: {} });
    }

    res.status(404).json({ success: false, message: "Vehicle not found" });
  } catch (e: any) {
    console.error("Delete vehicle error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

export default router;
