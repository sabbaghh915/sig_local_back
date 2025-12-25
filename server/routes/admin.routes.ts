import express from "express";
import { protect } from "../middleware/auth"; // بدون .js
// أو حسب اسم ملفك الحقيقي

const router = express.Router();

router.get("/users", protect, async (req, res) => {
  res.json([]);
});

export default router;
