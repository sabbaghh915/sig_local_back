import "dotenv/config";
import connectDB from "../config/database";
import { upsertRecordFromVehicle, upsertRecordFromPayment } from "../utils/recordsSync";

async function loadModel(path: string, namedCandidates: string[]) {
  const mod: any = await import(path);
  for (const name of namedCandidates) {
    if (mod?.[name]) return mod[name];
  }
  if (mod?.default) return mod.default;

  throw new Error(
    `Model not found in ${path}. Exports: ${Object.keys(mod || {}).join(", ")}`
  );
}

async function main() {
  await connectDB();

  // ✅ يلتقط SyrianVehicle سواء كان export default أو export const SyrianVehicle
  const SyrianVehicle = await loadModel("../models/SyrianVehicle", ["SyrianVehicle"]);
  const ForeignVehicle = await loadModel("../models/ForeignVehicle", ["ForeignVehicle"]);
  const Payment = await loadModel("../models/Payment", ["Payment"]);

  const sy = await SyrianVehicle.find({}).lean();
  for (const v of sy) await upsertRecordFromVehicle("SyrianVehicle", v);

  const fo = await ForeignVehicle.find({}).lean();
  for (const v of fo) await upsertRecordFromVehicle("ForeignVehicle", v);

  const pays = await Payment.find({}).lean();
  for (const p of pays) await upsertRecordFromPayment(p);

  console.log("✅ Backfill done:", { sy: sy.length, fo: fo.length, pays: pays.length });
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
