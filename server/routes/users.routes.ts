// routes/users.routes.ts
import { Router } from "express";
import { requireAuth, allowRoles } from "../middleware/auth";
import { User } from "../models/User";

const r = Router();

r.get("/", requireAuth, allowRoles("admin"), async (req, res) => {
  const filter: any = {};
  if (req.query.centerId) filter.centerId = String(req.query.centerId);
  const users = await User.find(filter).select("username fullName role centerId isActive").populate("centerId", "name code");
  res.json({ data: users });
});

export default r;
