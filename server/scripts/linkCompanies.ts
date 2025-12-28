import "dotenv/config";
import { Pool } from "pg";

const PG_URL = process.env.PG_URL;
if (!PG_URL) {
  console.error("❌ PG_URL missing in .env");
  process.exit(1);
}

function normalizeArabic(s: string | null): string | null {
  if (!s) return null;
  let x = s.trim();
  if (!x) return null;

  x = x.replace(/[ـ]/g, "");
  x = x.replace(/[إأآا]/g, "ا");
  x = x.replace(/[ى]/g, "ي");
  x = x.replace(/[ؤ]/g, "و");
  x = x.replace(/[ئ]/g, "ي");
  x = x.replace(/[ة]/g, "ه");
  x = x.replace(/\s+/g, " ");

  return x;
}

type NameCount = { name: string; cnt: number };

async function main() {
  const pg = new Pool({ connectionString: PG_URL });

  // 0) تجهيز schema المطلوب
  await pg.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await pg.query(`
    ALTER TABLE mandatory_policies
    ADD COLUMN IF NOT EXISTS company_name_normalized TEXT;
  `);

  await pg.query(`
    CREATE INDEX IF NOT EXISTS idx_mandatory_company_norm
    ON mandatory_policies(company_name_normalized);
  `);

  await pg.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS insurance_companies_name_norm_uq
    ON insurance_companies (name_normalized)
    WHERE name_normalized IS NOT NULL;
  `);

  // 1) اقرأ أسماء الشركات من العقود + عدد تكرارها
  const { rows: companyCounts } = await pg.query<{
    company_name: string;
    cnt: string;
  }>(`
    SELECT company_name, COUNT(*)::text AS cnt
    FROM mandatory_policies
    WHERE company_name IS NOT NULL AND trim(company_name) <> ''
    GROUP BY company_name
  `);

  // 2) جمّع حسب normalized واختر الاسم الأكثر تكرارًا ليكون display name
  const byNorm = new Map<string, NameCount>();
  for (const r of companyCounts) {
    const name = r.company_name;
    const cnt = parseInt(r.cnt, 10) || 0;
    const norm = normalizeArabic(name);
    if (!norm) continue;

    const prev = byNorm.get(norm);
    if (!prev || cnt > prev.cnt) {
      byNorm.set(norm, { name, cnt });
    } else {
      // نجمع التكرارات (اختياري)
      prev.cnt += cnt;
    }
  }

  // 3) اقرأ الشركات الموجودة حاليًا في insurance_companies
  const { rows: existing } = await pg.query<{ name_normalized: string }>(`
    SELECT name_normalized
    FROM insurance_companies
    WHERE name_normalized IS NOT NULL
  `);
  const existingSet = new Set(existing.map((x) => x.name_normalized));

  // 4) أضف الشركات الناقصة
  let inserted = 0;
  for (const [norm, obj] of byNorm.entries()) {
    if (existingSet.has(norm)) continue;

    const res = await pg.query(
      `
      INSERT INTO insurance_companies
  (id, legacy_mongo_id, name, name_normalized, share_percent, is_active, created_at, updated_at, raw_doc)
VALUES
  (gen_random_uuid(), NULL, $1, $2, 0, true, now(), now(), NULL)
ON CONFLICT DO NOTHING

      `,
      [obj.name, norm]
    );

    // res.rowCount = 1 إذا انضافت فعلاً
    inserted += res.rowCount ?? 0;
  }

  // 5) املأ company_name_normalized داخل mandatory_policies (على مستوى الاسم الأصلي لتقليل عدد العمليات)
  let normalizedUpdates = 0;
  for (const r of companyCounts) {
    const norm = normalizeArabic(r.company_name);
    if (!norm) continue;

    const res = await pg.query(
      `
      UPDATE mandatory_policies
      SET company_name_normalized = $1
      WHERE company_name = $2
        AND (company_name_normalized IS NULL OR company_name_normalized <> $1)
      `,
      [norm, r.company_name]
    );
    normalizedUpdates += res.rowCount ?? 0;
  }

  // 6) اربط العقود بالشركات عبر normalized
  const linkRes = await pg.query(`
    UPDATE mandatory_policies mp
    SET insurance_company_id = ic.id
    FROM insurance_companies ic
    WHERE mp.company_name_normalized IS NOT NULL
      AND ic.name_normalized IS NOT NULL
      AND mp.company_name_normalized = ic.name_normalized
      AND (mp.insurance_company_id IS NULL)
  `);

  // 7) إحصائيات نهائية
  const stats = await pg.query(`
    SELECT
      COUNT(*) FILTER (WHERE insurance_company_id IS NOT NULL) AS linked,
      COUNT(*) FILTER (WHERE insurance_company_id IS NULL) AS not_linked
    FROM mandatory_policies;
  `);

  console.log("✅ Done.");
  console.log("➕ Inserted companies:", inserted);
  console.log("🧩 Updated normalized rows in mandatory_policies:", normalizedUpdates);
  console.log("🔗 Linked policies:", linkRes.rowCount ?? 0);
  console.log("📊 Policy link stats:", stats.rows[0]);

  await pg.end();
}

main().catch((e) => {
  console.error("❌ linkCompanies failed:", e);
  process.exit(1);
});
