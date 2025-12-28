import { Router } from "express";
import { getRecordsStats } from "../controllers/stats.controller";


const router = Router();

// إذا عندك auth middleware ضيفه هنا
// router.get("/stats/records", requireAuth, getRecordsStats);

router.get("/stats/records", getRecordsStats);

export default router;
