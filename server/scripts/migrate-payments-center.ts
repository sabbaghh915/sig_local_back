import "dotenv/config";
import mongoose from "mongoose";
import Payment from "../models/Payment";
import User from "../models/User";

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ Missing MONGO_URI / MONGODB_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to Mongo");

  // 1) هات الدفعات التي لا تحتوي center
  const payments = await Payment.find({
    $or: [{ center: null }, { center: { $exists: false } }],
    processedBy: { $ne: null },
  }).select("_id processedBy");

  console.log("🔎 Payments missing center:", payments.length);

  if (!payments.length) {
    console.log("✅ Nothing to migrate.");
    process.exit(0);
  }

  // 2) هات المستخدمين المعنيين دفعة واحدة
  const userIds = Array.from(
    new Set(payments.map((p: any) => String(p.processedBy)).filter(Boolean))
  );

  const users = await User.find({ _id: { $in: userIds } }).select("center");
  const userCenterMap = new Map<string, any>();
  users.forEach((u: any) => userCenterMap.set(String(u._id), u.center || null));

  // 3) جهّز عمليات bulkWrite
  const ops: any[] = [];

  for (const p of payments as any[]) {
    const uid = String(p.processedBy);
    const center = userCenterMap.get(uid);

    // إذا المستخدم ما له مركز نتجاهلها
    if (!center) continue;

    ops.push({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { center } },
      },
    });
  }

  console.log("🧩 Will update payments:", ops.length);

  if (ops.length) {
    const result = await Payment.bulkWrite(ops);
    console.log("✅ bulkWrite result:", {
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } else {
    console.log("⚠️ No updates (users had no center).");
  }

  // 4) تقرير سريع
  const remaining = await Payment.countDocuments({
    $or: [{ center: null }, { center: { $exists: false } }],
  });
  console.log("📌 Remaining payments without center:", remaining);

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
