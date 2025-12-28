// routes/centers.routes.ts
import { Router } from "express";
import { requireAuth, allowRoles } from "../middleware/auth";
import { Center } from "../models/Center";

const r = Router();

r.get("/", requireAuth, allowRoles("admin"), async (req, res) => {
  const centers = await Center.find({}).sort({ name: 1 });
  res.json({ data: centers });
});

export default r;
