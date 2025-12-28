import "dotenv/config";
import { Pool } from "pg";

const PG_URL = process.env.PG_URL!;
if (!PG_URL) {
  console.error("❌ PG_URL missing");
  process.exit(1);
}

(async () => {
  const pg = new Pool({ connectionString: PG_URL });

  try {
    // اجعل code يسمح بـ NULL (اختياري لكن مفيد)
    await pg.query(`ALTER TABLE centers ALTER COLUMN code DROP NOT NULL;`);
  } catch (e: any) {
    // ممكن يكون بالفعل DROP NOT NULL أو الجدول غير موجود
  }

  // حاول إسقاط الـ UNIQUE constraint (اسمه غالباً centers_code_key)
  try {
    await pg.query(`ALTER TABLE centers DROP CONSTRAINT IF EXISTS centers_code_key;`);
  } catch (e: any) {
    // إذا كان Index وليس constraint
  }

  // حاول إسقاط index بنفس الاسم (أحياناً يكون هو السبب)
  try {
    await pg.query(`DROP INDEX IF EXISTS centers_code_key;`);
  } catch (e: any) {}

  // أنشئ index عادي (غير unique) للمساعدة بالبحث
  await pg.query(`CREATE INDEX IF NOT EXISTS idx_centers_code ON centers(code);`);

  await pg.end();
  console.log("✅ centers constraints fixed (code is no longer UNIQUE).");
})().catch((e) => {
  console.error("❌ Fix failed:", e);
  process.exit(1);
});
