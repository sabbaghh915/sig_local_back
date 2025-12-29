import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import connectDB from "./config/database";

// Import routes
import authRoutes from "./routes/auth";
import vehicleRoutes from "./routes/vehicles";
import paymentRoutes from "./routes/payments";
import insuranceRouter from "./routes/insurance";
import pricingRoutes from "./routes/pricing";
import adminRoutes from "./routes/admin";
import adminRoutes1 from "./routes/admin.routes";
import adminCentersRoutes from "./routes/admin.centers.routes";
import metaRoutes from "./routes/meta.routes";
import financeRoutes from "./routes/admin.finance";
import publicCentersRoutes from "./routes//centers.public";
import statsRoutes from "./routes/stats.routes";
import insuranceCompaniesRoutes from "./routes/admin.insuranceCompanies";
import exportRoutes from "./routes/admin.exports.routes";




// Connect to MongoDB
connectDB();

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  const asRouter = (r: any) => (r?.default ? r.default : r);


  app.get("/api/demo", handleDemo);

  console.log("centers typeof:", typeof adminCentersRoutes, "keys:", Object.keys(adminCentersRoutes || {}));


  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/vehicles", vehicleRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/insurance", insuranceRouter);
  app.use("/api/pricing", pricingRoutes);
  app.use("/api/meta", metaRoutes);
  app.use("/api/admin/finance", financeRoutes);
  app.use("/api", publicCentersRoutes);
  app.use("/api", statsRoutes);
  app.use("/api/admin/insurance-companies", insuranceCompaniesRoutes);
  app.use("/api", exportRoutes);

  
  // ✅ Admin
app.use("/api/admin", asRouter(adminCentersRoutes));
app.use("/api/admin/centers", adminCentersRoutes);
app.use("/api/admin", asRouter(adminRoutes));
app.use("/api/admin", asRouter(adminRoutes1));
  

  // Health check for MongoDB
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected"
    });
  });

  return app;
}