import express from "express";
import Center from "../models/Center";
import User from "../models/User";
import { parsePagination, buildPaginationMeta } from "../../utils/pagination";

console.log("✅ admin.centers.routes LOADED");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();

    const filter: any = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { ip: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
        { address: { $regex: q, $options: "i" } },
        { city: { $regex: q, $options: "i" } },
      ];
    }

    const [centers, total] = await Promise.all([
      Center.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Center.countDocuments(filter),
    ]);

    const centerIds = centers.map((c: any) => c._id);

    const counts = await User.aggregate([
      { $match: { role: { $in: ["employee", "admin"] }, center: { $in: centerIds } } },
      { $group: { _id: "$center", employeesCount: { $sum: 1 } } },
    ]);

    const countMap = new Map(counts.map((c) => [String(c._id), c.employeesCount]));

    const items = centers.map((c: any) => ({
      ...c,
      employeesCount: countMap.get(String(c._id)) || 0,
    }));

    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      items,
      meta: {
        page,
        limit,
        total,
        pages,
        hasPrev: page > 1,
        hasNext: page < pages,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "Failed to load centers" });
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
