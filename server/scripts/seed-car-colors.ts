import "dotenv/config";
import xlsx from "xlsx";
import path from "path";
import connectDB from "../config/database";
import CarColor from "../models/CarColor";

const argFile = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1];

if (!argFile) {
  console.error('Usage: npx tsx scripts/seed-car-colors.ts --file="C:\\path\\dbo_tbl_CarsColors.xlsx"');
  process.exit(1);
}

const normalize = (s: any) => String(s || "").trim().toLowerCase();

async function main() {
  await connectDB();

  const filePath = path.resolve(argFile);
  console.log("📄 Reading:", filePath);

  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const ops = rows
    .filter((r) => r.CCID !== "" && r.Car_Colors !== "")
    .map((r) => {
      const legacyId = Number(r.CCID);
      const name = String(r.Car_Colors).trim();
      return {
        updateOne: {
          filter: { legacyId },
          update: {
            $set: {
              legacyId,
              name,
              normalized: normalize(name),
              isActive: true,
            },
          },
          upsert: true,
        },
      };
    });

  const result = ops.length ? await CarColor.bulkWrite(ops) : null;

  console.log("✅ Done:", {
    total: ops.length,
    upserted: result?.upsertedCount || 0,
    modified: result?.modifiedCount || 0,
    matched: result?.matchedCount || 0,
  });

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
