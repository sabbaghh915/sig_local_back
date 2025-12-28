import express from "express";
import Center from "../models/Center";
import User from "../models/User";

console.log("✅ admin.centers.routes LOADED");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const centers = await Center.find().sort({ createdAt: -1 }).lean();

    const counts = await User.aggregate([
      { $match: { role: { $in: ["employee", "admin"] } } },
      { $group: { _id: "$center", employeesCount: { $sum: 1 } } },
    ]);

    const countMap = new Map(counts.map((c) => [String(c._id), c.employeesCount]));

    const result = centers.map((c: any) => ({
      ...c,
      employeesCount: countMap.get(String(c._id)) || 0,
    }));

    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to load centers" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, ip, code, address, isActive } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const created = await Center.create({ name, ip, code, address, isActive });
    return res.json(created);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to create center" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await Center.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.json(updated);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to update center" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Center.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to delete center" });
  }
});

export default router;
