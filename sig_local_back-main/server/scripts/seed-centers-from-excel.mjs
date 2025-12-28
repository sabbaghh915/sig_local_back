import "dotenv/config";
import mongoose from "mongoose";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

import CenterModule from "../models/Center.js";
const Center = CenterModule.default || CenterModule;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argFile = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1];
const FILE = argFile || "المراكز.xlsx";

function isIp(v) {
  if (typeof v !== "string") return false;
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v.trim());
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ ضع MONGO_URI داخل .env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const filePath = path.resolve(process.cwd(), FILE);
  console.log("📄 Reading:", filePath);

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });

  const centers = rows
    .map((r) => {
      const rawName = r.Center_Name ?? r.name ?? r.Name;
      const rawIp = r.Center_Address ?? r.ip ?? r.IP;

      const ip = typeof rawIp === "string" && isIp(rawIp) ? rawIp.trim() : null;

      return {
        legacyId: r.Center_Id ? Number(r.Center_Id) : undefined,
        name: String(rawName || "").trim(),
        ip,
        code: r.Center_Note != null ? String(r.Center_Note).trim() : undefined,
        province: r.Center_Cat != null ? String(r.Center_Cat).trim() : undefined,
        isActive: true,
      };
    })
    .filter((c) => c.name);

  const ops = centers.map((c) => ({
    updateOne: {
      filter: c.legacyId ? { legacyId: c.legacyId } : { name: c.name },
      update: { $set: c },
      upsert: true,
    },
  }));

  const res = await Center.bulkWrite(ops);
  console.log("✅ Done:", {
    upserted: res.upsertedCount,
    modified: res.modifiedCount,
    matched: res.matchedCount,
    total: centers.length,
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
