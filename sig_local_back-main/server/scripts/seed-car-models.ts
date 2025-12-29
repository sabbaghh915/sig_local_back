import "dotenv/config";
import xlsx from "xlsx";
import path from "path";
import connectDB from "../config/database";
import CarModel from "../models/CarModel";

const argFile = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1];
const argSheet = process.argv.find((a) => a.startsWith("--sheet="))?.split("=")[1];

if (!argFile) {
  console.error('Usage: npx tsx scripts/seed-car-models.ts --file="F:\\sig\\kind.xlsx" --sheet="Sheet1"');
  process.exit(1);
}

const s = (v: any) => String(v ?? "").trim();
const normalize = (v: any) => s(v).toLowerCase();

const toNumber = (v: any) => {
  const str = s(v);
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
};

const pick = (row: any, keys: string[]) => {
  for (const k of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, k) && s(row[k]) !== "") return row[k];
  }
  return "";
};

async function main() {
  await connectDB();

  const filePath = path.resolve(argFile);
  console.log("📄 Reading:", filePath);

  const wb = xlsx.readFile(filePath);
  const sheetName = argSheet || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (!sheet) {
    console.error("❌ Sheet not found:", sheetName, "Available:", wb.SheetNames);
    process.exit(1);
  }

  const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  console.log("🧾 Sheet:", sheetName);
  console.log("🔎 Columns detected:", Object.keys(rows[0] || {}));

  let skipped = 0;

  const ops = rows
    .map((r, idx) => {
      // يدعم CM_ID أو legacyId أو id
      const legacyIdRaw = pick(r, ["CM_ID", "legacyId", "id", "ID"]);
      const legacyId = toNumber(legacyIdRaw);

      // يدعم CM_Manufact أو make أو name_en
      const make = s(pick(r, ["CM_Manufact", "make", "name_en", "manufacturer"]));

      // يدعم CM_Type أو type أو name_ar (ولو فاضي نخليه مثل make حتى ما يكسر)
      const typeRaw = s(pick(r, ["CM_Type", "type", "name_ar", "model"]));
      const type = typeRaw || make;

      if (legacyId === null || !make) {
        skipped++;
        // أول 5 أسطر مرفوضة فقط للتشخيص
        if (skipped <= 5) {
          console.log("⚠️ Skipped row", idx + 2, { legacyIdRaw, make, typeRaw });
        }
        return null;
      }

      return {
        updateOne: {
          filter: { legacyId },
          update: {
            $set: {
              legacyId,
              make,
              type,
              normalizedMake: normalize(make),
              normalizedType: normalize(type),
              isActive: true,
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean) as any[];

  const result = ops.length ? await CarModel.bulkWrite(ops) : null;

  console.log("✅ Done:", {
    total: ops.length,
    skipped,
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
