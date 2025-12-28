import "dotenv/config";
import xlsx from "xlsx";
import path from "path";
import connectDB from "../config/database";
import CarColor from "../models/CarColor";

const argFile = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1];
const argSheet = process.argv.find((a) => a.startsWith("--sheet="))?.split("=")[1];
// اختياري: prefer=ar أو prefer=en
const argPrefer = process.argv.find((a) => a.startsWith("--prefer="))?.split("=")[1] || "ar";

if (!argFile) {
  console.error('Usage: npx tsx scripts/seed-car-colors.ts --file="C:\\path\\color.xlsx" --sheet="Sheet1" --prefer=ar');
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
      // legacyId: يدعم CCID أو id أو legacyId
      const legacyIdRaw = pick(r, ["CCID", "id", "legacyId", "ID"]);
      const legacyId = toNumber(legacyIdRaw);

      // أسماء اللون: يدعم Car_Colors أو name_ar أو name_en أو name
      const nameAr = s(pick(r, ["name_ar", "Car_Colors_AR", "color_ar"]));
      const nameEn = s(pick(r, ["name_en", "Car_Colors_EN", "color_en"]));
      const nameLegacy = s(pick(r, ["Car_Colors", "name", "ColorName"]));

      // اختر اسم اللون بحسب prefer
      const name =
        (argPrefer === "en" ? (nameEn || nameAr) : (nameAr || nameEn)) ||
        nameLegacy;

      // hex اختياري (إذا عندك حقل بالـ schema اسمه hex)
      const hex = s(pick(r, ["hex", "HEX", "color_hex"]));

      if (legacyId === null || !name) {
        skipped++;
        if (skipped <= 5) console.log("⚠️ Skipped row", idx + 2, { legacyIdRaw, nameAr, nameEn, nameLegacy });
        return null;
      }

      return {
        updateOne: {
          filter: { legacyId },
          update: {
            $set: {
              legacyId,
              name,                 // الأساسي (عربي أو إنكليزي حسب prefer)
              normalized: normalize(name),
              isActive: true,

              // إذا Schema عندك يدعمهم رح ينحفظوا، وإلا مافيه مشكلة (راح يتم تجاهلهم في الغالب)
              nameAr: nameAr || undefined,
              nameEn: nameEn || undefined,
              hex: hex || undefined,
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean) as any[];

  const result = ops.length ? await CarColor.bulkWrite(ops) : null;

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
