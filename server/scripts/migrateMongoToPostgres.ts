import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import { Pool } from "pg";
import { v5 as uuidv5 } from "uuid";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const MONGO_DB = process.env.MONGO_DB || "insurance-system";
const PG_URL = process.env.PG_URL || "";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 200);

if (!PG_URL) {
  console.error("❌ Missing PG_URL in .env");
  process.exit(1);
}

// Namespace ثابت لـ uuidv5 (لا تغيّره بعد بدء النقل)
const UUID_NAMESPACE = "9f5d2d6b-3de5-4f16-9d2f-0cf6db2ce9c6";

function extractLeadingNumber(s: string | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

function centerCodeFromDoc(c: any): string {
  // 1) code إن وجد
  const code = toText(c.code);
  if (code) return code;

  // 2) legacyId إن وجد
  if (c.legacyId !== undefined && c.legacyId !== null) return String(c.legacyId);

  // 3) استخراج الرقم من بداية الاسم "21- طرطوس2"
  const fromName = extractLeadingNumber(toText(c.name));
  if (fromName) return fromName;

  // 4) آخر حل: كود ثابت وفريد مبني على ObjectId
  return `AUTO-${c._id.toString()}`;
}


// UUID ثابت من ObjectId string
function uuidFromObjectId(id: ObjectId | string): string {
  const s = typeof id === "string" ? id : id.toString();
  return uuidv5(s, UUID_NAMESPACE);
}

function toText(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toInt(v: any): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toBigIntNumber(v: any): number | null {
  // نستخدم number في JS لكن نخزن BIGINT في PG (قيمك آمنة ضمن نطاق number غالباً)
  return toInt(v);
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Mongo ISODate يظهر ك Date عند القراءة
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// Normalize عربي بسيط لأسماء الشركات/الأشياء
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

async function ensureSchema(pg: Pool) {
  const sql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    legacy_mongo_id TEXT UNIQUE,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    email TEXT UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL,
    employee_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_doc JSONB
  );

  CREATE TABLE IF NOT EXISTS centers (
    id UUID PRIMARY KEY,
    legacy_mongo_id TEXT UNIQUE,
    legacy_id INT UNIQUE,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    province TEXT,
    ip TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_doc JSONB
  );

  CREATE TABLE IF NOT EXISTS insurance_companies (
    id UUID PRIMARY KEY,
    legacy_mongo_id TEXT UNIQUE,
    name TEXT NOT NULL,
    name_normalized TEXT,
    share_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_doc JSONB
  );
  CREATE UNIQUE INDEX IF NOT EXISTS insurance_companies_name_norm_uq
  ON insurance_companies (name_normalized)
  WHERE name_normalized IS NOT NULL;

  -- Vehicles base
  CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY,
    legacy_mongo_id TEXT UNIQUE,
    vehicle_type TEXT NOT NULL, -- 'syrian' | 'foreign'

    owner_name TEXT,
    national_id TEXT,
    phone_number TEXT,
    address TEXT,

    plate_number TEXT,
    plate_country TEXT,

    chassis_number TEXT,
    engine_number TEXT,

    brand TEXT,
    model TEXT,
    year INT,
    color TEXT,

    policy_duration TEXT,
    coverage TEXT,

    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,

    raw_doc JSONB
  );
  CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate_number);
  CREATE INDEX IF NOT EXISTS idx_vehicles_chassis ON vehicles(chassis_number);

  CREATE TABLE IF NOT EXISTS syrian_vehicles_details (
    vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    fuel_type TEXT,
    notes TEXT,
    raw_doc JSONB
  );

  CREATE TABLE IF NOT EXISTS foreign_vehicles_details (
    vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    passport_number TEXT,
    nationality TEXT,
    customs_document TEXT,
    entry_point TEXT,
    entry_date DATE,
    exit_date DATE,
    plate_country TEXT,
    raw_doc JSONB
  );

  CREATE TABLE IF NOT EXISTS vehicle_pricing (
    vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    insurance_type TEXT,
    months INT,
    vehicle_code TEXT,
    category TEXT,
    classification TEXT,
    border_vehicle_type TEXT,

    net_premium BIGINT,
    stamp_fee BIGINT,
    war_effort BIGINT,
    martyr_fund BIGINT,
    local_administration BIGINT,
    reconstruction BIGINT,
    total BIGINT,

    raw_doc JSONB
  );

  CREATE TABLE IF NOT EXISTS mandatory_policies (
    id UUID PRIMARY KEY,
    legacy_mongo_id TEXT UNIQUE,

    serial_key BIGINT UNIQUE NOT NULL,
    contract_no BIGINT,
    receipt_no TEXT,
    company_name TEXT,
    insurance_company_id UUID REFERENCES insurance_companies(id) ON DELETE SET NULL,

    issue_center_code INT,
    issue_center_name TEXT,
    issue_center_raw TEXT,

    duration_months INT,
    policy_created_at TIMESTAMPTZ,
    policy_start_at TIMESTAMPTZ,
    policy_end_at TIMESTAMPTZ,
    policy_paid_at TIMESTAMPTZ,
    policy_is_paid BOOLEAN,
    e_code TEXT,
    contract_kind_code INT,

    external_key TEXT,
    contract_key_hex TEXT,

    insured_name TEXT,
    insured_full_name TEXT,
    insured_father_name TEXT,
    insured_last_name TEXT,
    insured_national_id TEXT,
    insured_phone TEXT,
    insured_mobile TEXT,
    insured_address TEXT,
    insured_city TEXT,
    insured_area TEXT,
    insured_street TEXT,

    vehicle_number TEXT,
    vehicle_make TEXT,
    vehicle_model TEXT,
    vehicle_type_name TEXT,
    vehicle_car_name TEXT,
    vehicle_manufacture_year INT,
    vehicle_color TEXT,
    vehicle_fuel_type TEXT,
    vehicle_engine_no TEXT,
    vehicle_chassis_no TEXT,
    vehicle_license_no TEXT,
    vehicle_engine_power INT,
    vehicle_engine_size INT,
    vehicle_category_raw TEXT,
    vehicle_governorate_raw TEXT,

    net_premium BIGINT,
    stamp BIGINT,
    financial_stamp BIGINT,
    local_fee BIGINT,
    war_fee BIGINT,
    martyr_fee BIGINT,
    reconstruction_fee BIGINT,
    total BIGINT,
    card_price BIGINT,
    rescue_service_fee BIGINT,
    full_value BIGINT,
    company_share BIGINT,
    union_share BIGINT,

    source_file TEXT,
    source_row_number INT,
    imported_at TIMESTAMPTZ,

    raw_doc JSONB,
    raw_fields JSONB
  );

  CREATE UNIQUE INDEX IF NOT EXISTS mandatory_policies_ecode_uq_notnull
  ON mandatory_policies (e_code)
  WHERE e_code IS NOT NULL;

  CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,
    legacy_mongo_id TEXT UNIQUE,

    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    vehicle_model TEXT,
    policy_number TEXT,
    amount BIGINT NOT NULL,

    payment_method TEXT,
    payment_status TEXT,
    receipt_number TEXT,

    paid_by TEXT,
    payer_phone TEXT,

    payment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,

    raw_doc JSONB
  );

  CREATE UNIQUE INDEX IF NOT EXISTS payments_receipt_unique_notnull
  ON payments (receipt_number)
  WHERE receipt_number IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_payments_policy_number ON payments(policy_number);
  CREATE INDEX IF NOT EXISTS idx_payments_vehicle_id ON payments(vehicle_id);
  CREATE INDEX IF NOT EXISTS idx_payments_processed_by ON payments(processed_by);
  `;
  await pg.query(sql);
}

type InsertSpec = {
  table: string;
  columns: string[];
  // لكل عمود: هل يحتاج ::jsonb ؟
  jsonbCols?: Set<string>;
  // أي عمود نعمل عليه upsert (عادة legacy_mongo_id)
  conflictTarget: string; // e.g. legacy_mongo_id
};

async function bulkUpsert(pg: Pool, spec: InsertSpec, rows: Record<string, any>[]) {
  if (!rows.length) return;

  const { table, columns, conflictTarget, jsonbCols } = spec;
  const colList = columns.map((c) => `"${c}"`).join(", ");

  // build values placeholders
  const values: any[] = [];
  const chunks: string[] = [];

  rows.forEach((r, i) => {
    const base = i * columns.length;
    const ph = columns.map((c, j) => {
      const idx = base + j + 1;
      const isJsonb = jsonbCols?.has(c);
      values.push(isJsonb ? JSON.stringify(r[c] ?? null) : r[c] ?? null);
      return isJsonb ? `$${idx}::jsonb` : `$${idx}`;
    });
    chunks.push(`(${ph.join(", ")})`);
  });

  // update set (لا نحدّث id)
  const updateCols = columns.filter((c) => c !== "id");
  const setClause = updateCols
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");

  const sql = `
    INSERT INTO ${table} (${colList})
    VALUES ${chunks.join(", ")}
    ON CONFLICT ("${conflictTarget}") DO UPDATE
    SET ${setClause};
  `;

  await pg.query(sql, values);
}

async function run() {
  const mongo = new MongoClient(MONGO_URI);
  const pg = new Pool({ connectionString: PG_URL });

  console.log("🔌 Connecting...");
  await mongo.connect();
  const db = mongo.db(MONGO_DB);
  await ensureSchema(pg);
  console.log("✅ Connected & schema ready");

  // ===== 1) users =====
  {
    console.log("➡️ Migrating users...");
    const cursor = db.collection("users").find({});
    const batch: any[] = [];
    let count = 0;

    for await (const u of cursor) {
      const id = uuidFromObjectId(u._id);
      batch.push({
        id,
        legacy_mongo_id: u._id.toString(),
        username: toText(u.username),
        password_hash: toText(u.password),
        email: toText(u.email),
        full_name: toText(u.fullName),
        role: toText(u.role) || "employee",
        employee_id: toText(u.employeeId),
        is_active: !!u.isActive,
        created_at: toDate(u.createdAt),
        updated_at: toDate(u.updatedAt),
        raw_doc: u,
      });

      if (batch.length >= BATCH_SIZE) {
        await bulkUpsert(
          pg,
          {
            table: "users",
            columns: [
              "id",
              "legacy_mongo_id",
              "username",
              "password_hash",
              "email",
              "full_name",
              "role",
              "employee_id",
              "is_active",
              "created_at",
              "updated_at",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "legacy_mongo_id",
          },
          batch
        );
        count += batch.length;
        batch.length = 0;
      }
    }
    if (batch.length) {
      await bulkUpsert(
        pg,
        {
          table: "users",
          columns: [
            "id",
            "legacy_mongo_id",
            "username",
            "password_hash",
            "email",
            "full_name",
            "role",
            "employee_id",
            "is_active",
            "created_at",
            "updated_at",
            "raw_doc",
          ],
          jsonbCols: new Set(["raw_doc"]),
          conflictTarget: "legacy_mongo_id",
        },
        batch
      );
      count += batch.length;
    }
    console.log(`✅ users done: ${count}`);
  }

  // ===== 2) centers =====
  {
    console.log("➡️ Migrating centers...");
    const cursor = db.collection("centers").find({});
    const batch: any[] = [];
    let count = 0;

    for await (const c of cursor) {
      const id = uuidFromObjectId(c._id);
      batch.push({
        id,
        legacy_mongo_id: c._id.toString(),
        legacy_id: toInt(c.legacyId),
        code: centerCodeFromDoc(c),
        name: toText(c.name),
        province: toText(c.province),
        ip: toText(c.ip),
        is_active: !!c.isActive,
        created_at: toDate(c.createdAt),
        updated_at: toDate(c.updatedAt),
        raw_doc: c,
      });

      if (batch.length >= BATCH_SIZE) {
        await bulkUpsert(
          pg,
          {
            table: "centers",
            columns: [
              "id",
              "legacy_mongo_id",
              "legacy_id",
              "code",
              "name",
              "province",
              "ip",
              "is_active",
              "created_at",
              "updated_at",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "legacy_mongo_id",
          },
          batch
        );
        count += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length) {
      await bulkUpsert(
        pg,
        {
          table: "centers",
          columns: [
            "id",
            "legacy_mongo_id",
            "legacy_id",
            "code",
            "name",
            "province",
            "ip",
            "is_active",
            "created_at",
            "updated_at",
            "raw_doc",
          ],
          jsonbCols: new Set(["raw_doc"]),
          conflictTarget: "legacy_mongo_id",
        },
        batch
      );
      count += batch.length;
    }

    console.log(`✅ centers done: ${count}`);
  }

  // ===== 3) insurancecompanies =====
  {
    console.log("➡️ Migrating insurancecompanies...");
    const cursor = db.collection("insurancecompanies").find({});
    const batch: any[] = [];
    let count = 0;

    for await (const x of cursor) {
      const id = uuidFromObjectId(x._id);
      const name = toText(x.name);
      batch.push({
        id,
        legacy_mongo_id: x._id.toString(),
        name,
        name_normalized: normalizeArabic(name),
        share_percent: typeof x.sharePercent === "number" ? x.sharePercent : (toInt(x.sharePercent) ?? 0),
        is_active: !!x.isActive,
        created_at: toDate(x.createdAt),
        updated_at: toDate(x.updatedAt),
        raw_doc: x,
      });

      if (batch.length >= BATCH_SIZE) {
        await bulkUpsert(
          pg,
          {
            table: "insurance_companies",
            columns: [
              "id",
              "legacy_mongo_id",
              "name",
              "name_normalized",
              "share_percent",
              "is_active",
              "created_at",
              "updated_at",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "legacy_mongo_id",
          },
          batch
        );
        count += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length) {
      await bulkUpsert(
        pg,
        {
          table: "insurance_companies",
          columns: [
            "id",
            "legacy_mongo_id",
            "name",
            "name_normalized",
            "share_percent",
            "is_active",
            "created_at",
            "updated_at",
            "raw_doc",
          ],
          jsonbCols: new Set(["raw_doc"]),
          conflictTarget: "legacy_mongo_id",
        },
        batch
      );
      count += batch.length;
    }

    console.log(`✅ insurancecompanies done: ${count}`);
  }

  // ===== 4) vehicles: syrian_vehicles + foreign_vehicles =====
  {
    console.log("➡️ Migrating vehicles (syrian + foreign) ...");

    // Syrian
    {
      const cursor = db.collection("syrian_vehicles").find({});
      const vehiclesBatch: any[] = [];
      const detailsBatch: any[] = [];
      const pricingBatch: any[] = [];
      let count = 0;

      for await (const v of cursor) {
        const id = uuidFromObjectId(v._id);

        vehiclesBatch.push({
          id,
          legacy_mongo_id: v._id.toString(),
          vehicle_type: "syrian",
          owner_name: toText(v.ownerName),
          national_id: toText(v.nationalId),
          phone_number: toText(v.phoneNumber),
          address: toText(v.address),
          plate_number: toText(v.plateNumber),
          plate_country: toText(v.plateCountry),
          chassis_number: toText(v.chassisNumber),
          engine_number: toText(v.engineNumber),
          brand: toText(v.brand),
          model: toText(v.model),
          year: toInt(v.year),
          color: toText(v.color),
          policy_duration: toText(v.policyDuration),
          coverage: toText(v.coverage),
          created_at: toDate(v.createdAt),
          updated_at: toDate(v.updatedAt),
          raw_doc: v,
        });

        detailsBatch.push({
          vehicle_id: id,
          fuel_type: toText(v.fuelType),
          notes: toText(v.notes),
          raw_doc: v,
        });

        const p = v.pricing || {};
        const q = p.quote || {};
        pricingBatch.push({
          vehicle_id: id,
          insurance_type: toText(p.insuranceType),
          months: toInt(p.months),
          vehicle_code: toText(p.vehicleCode),
          category: toText(p.category),
          classification: toText(p.classification),
          border_vehicle_type: toText(p.borderVehicleType),

          net_premium: toBigIntNumber(q.netPremium),
          stamp_fee: toBigIntNumber(q.stampFee),
          war_effort: toBigIntNumber(q.warEffort),
          martyr_fund: toBigIntNumber(q.martyrFund),
          local_administration: toBigIntNumber(q.localAdministration),
          reconstruction: toBigIntNumber(q.reconstruction),
          total: toBigIntNumber(q.total),

          raw_doc: v.pricing,
        });

        if (vehiclesBatch.length >= BATCH_SIZE) {
          await bulkUpsert(
            pg,
            {
              table: "vehicles",
              columns: [
                "id",
                "legacy_mongo_id",
                "vehicle_type",
                "owner_name",
                "national_id",
                "phone_number",
                "address",
                "plate_number",
                "plate_country",
                "chassis_number",
                "engine_number",
                "brand",
                "model",
                "year",
                "color",
                "policy_duration",
                "coverage",
                "created_at",
                "updated_at",
                "raw_doc",
              ],
              jsonbCols: new Set(["raw_doc"]),
              conflictTarget: "legacy_mongo_id",
            },
            vehiclesBatch
          );

          await bulkUpsert(
            pg,
            {
              table: "syrian_vehicles_details",
              columns: ["vehicle_id", "fuel_type", "notes", "raw_doc"],
              jsonbCols: new Set(["raw_doc"]),
              conflictTarget: "vehicle_id",
            },
            detailsBatch
          );

          await bulkUpsert(
            pg,
            {
              table: "vehicle_pricing",
              columns: [
                "vehicle_id",
                "insurance_type",
                "months",
                "vehicle_code",
                "category",
                "classification",
                "border_vehicle_type",
                "net_premium",
                "stamp_fee",
                "war_effort",
                "martyr_fund",
                "local_administration",
                "reconstruction",
                "total",
                "raw_doc",
              ],
              jsonbCols: new Set(["raw_doc"]),
              conflictTarget: "vehicle_id",
            },
            pricingBatch
          );

          count += vehiclesBatch.length;
          vehiclesBatch.length = 0;
          detailsBatch.length = 0;
          pricingBatch.length = 0;
        }
      }

      if (vehiclesBatch.length) {
        await bulkUpsert(
          pg,
          {
            table: "vehicles",
            columns: [
              "id",
              "legacy_mongo_id",
              "vehicle_type",
              "owner_name",
              "national_id",
              "phone_number",
              "address",
              "plate_number",
              "plate_country",
              "chassis_number",
              "engine_number",
              "brand",
              "model",
              "year",
              "color",
              "policy_duration",
              "coverage",
              "created_at",
              "updated_at",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "legacy_mongo_id",
          },
          vehiclesBatch
        );

        await bulkUpsert(
          pg,
          {
            table: "syrian_vehicles_details",
            columns: ["vehicle_id", "fuel_type", "notes", "raw_doc"],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "vehicle_id",
          },
          detailsBatch
        );

        await bulkUpsert(
          pg,
          {
            table: "vehicle_pricing",
            columns: [
              "vehicle_id",
              "insurance_type",
              "months",
              "vehicle_code",
              "category",
              "classification",
              "border_vehicle_type",
              "net_premium",
              "stamp_fee",
              "war_effort",
              "martyr_fund",
              "local_administration",
              "reconstruction",
              "total",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "vehicle_id",
          },
          pricingBatch
        );

        count += vehiclesBatch.length;
      }

      console.log(`✅ syrian_vehicles migrated: ${count}`);
    }

    // Foreign
    {
      const cursor = db.collection("foreign_vehicles").find({});
      const vehiclesBatch: any[] = [];
      const detailsBatch: any[] = [];
      const pricingBatch: any[] = [];
      let count = 0;

      for await (const v of cursor) {
        const id = uuidFromObjectId(v._id);

        vehiclesBatch.push({
          id,
          legacy_mongo_id: v._id.toString(),
          vehicle_type: "foreign",
          owner_name: toText(v.ownerName),
          national_id: toText(v.nationalId),
          phone_number: toText(v.phoneNumber),
          address: toText(v.address),
          plate_number: toText(v.plateNumber),
          plate_country: toText(v.plateCountry),
          chassis_number: toText(v.chassisNumber),
          engine_number: toText(v.engineNumber),
          brand: toText(v.brand),
          model: toText(v.model),
          year: toInt(v.year),
          color: toText(v.color),
          policy_duration: toText(v.policyDuration),
          coverage: toText(v.coverage),
          created_at: toDate(v.createdAt),
          updated_at: toDate(v.updatedAt),
          raw_doc: v,
        });

        detailsBatch.push({
          vehicle_id: id,
          passport_number: toText(v.passportNumber),
          nationality: toText(v.nationality),
          customs_document: toText(v.customsDocument),
          entry_point: toText(v.entryPoint),
          entry_date: toDate(v.entryDate) ? new Date(toDate(v.entryDate)!).toISOString().slice(0, 10) : null,
          exit_date: toDate(v.exitDate) ? new Date(toDate(v.exitDate)!).toISOString().slice(0, 10) : null,
          plate_country: toText(v.plateCountry),
          raw_doc: v,
        });

        const p = v.pricing || {};
        const q = p.quote || {};
        pricingBatch.push({
          vehicle_id: id,
          insurance_type: toText(p.insuranceType),
          months: toInt(p.months),
          vehicle_code: toText(p.vehicleCode),
          category: toText(p.category),
          classification: toText(p.classification),
          border_vehicle_type: toText(p.borderVehicleType),

          net_premium: toBigIntNumber(q.netPremium),
          stamp_fee: toBigIntNumber(q.stampFee),
          war_effort: toBigIntNumber(q.warEffort),
          martyr_fund: toBigIntNumber(q.martyrFund),
          local_administration: toBigIntNumber(q.localAdministration),
          reconstruction: toBigIntNumber(q.reconstruction),
          total: toBigIntNumber(q.total),

          raw_doc: v.pricing,
        });

        if (vehiclesBatch.length >= BATCH_SIZE) {
          await bulkUpsert(
            pg,
            {
              table: "vehicles",
              columns: [
                "id",
                "legacy_mongo_id",
                "vehicle_type",
                "owner_name",
                "national_id",
                "phone_number",
                "address",
                "plate_number",
                "plate_country",
                "chassis_number",
                "engine_number",
                "brand",
                "model",
                "year",
                "color",
                "policy_duration",
                "coverage",
                "created_at",
                "updated_at",
                "raw_doc",
              ],
              jsonbCols: new Set(["raw_doc"]),
              conflictTarget: "legacy_mongo_id",
            },
            vehiclesBatch
          );

          await bulkUpsert(
            pg,
            {
              table: "foreign_vehicles_details",
              columns: [
                "vehicle_id",
                "passport_number",
                "nationality",
                "customs_document",
                "entry_point",
                "entry_date",
                "exit_date",
                "plate_country",
                "raw_doc",
              ],
              jsonbCols: new Set(["raw_doc"]),
              conflictTarget: "vehicle_id",
            },
            detailsBatch
          );

          await bulkUpsert(
            pg,
            {
              table: "vehicle_pricing",
              columns: [
                "vehicle_id",
                "insurance_type",
                "months",
                "vehicle_code",
                "category",
                "classification",
                "border_vehicle_type",
                "net_premium",
                "stamp_fee",
                "war_effort",
                "martyr_fund",
                "local_administration",
                "reconstruction",
                "total",
                "raw_doc",
              ],
              jsonbCols: new Set(["raw_doc"]),
              conflictTarget: "vehicle_id",
            },
            pricingBatch
          );

          count += vehiclesBatch.length;
          vehiclesBatch.length = 0;
          detailsBatch.length = 0;
          pricingBatch.length = 0;
        }
      }

      if (vehiclesBatch.length) {
        await bulkUpsert(
          pg,
          {
            table: "vehicles",
            columns: [
              "id",
              "legacy_mongo_id",
              "vehicle_type",
              "owner_name",
              "national_id",
              "phone_number",
              "address",
              "plate_number",
              "plate_country",
              "chassis_number",
              "engine_number",
              "brand",
              "model",
              "year",
              "color",
              "policy_duration",
              "coverage",
              "created_at",
              "updated_at",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "legacy_mongo_id",
          },
          vehiclesBatch
        );

        await bulkUpsert(
          pg,
          {
            table: "foreign_vehicles_details",
            columns: [
              "vehicle_id",
              "passport_number",
              "nationality",
              "customs_document",
              "entry_point",
              "entry_date",
              "exit_date",
              "plate_country",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "vehicle_id",
          },
          detailsBatch
        );

        await bulkUpsert(
          pg,
          {
            table: "vehicle_pricing",
            columns: [
              "vehicle_id",
              "insurance_type",
              "months",
              "vehicle_code",
              "category",
              "classification",
              "border_vehicle_type",
              "net_premium",
              "stamp_fee",
              "war_effort",
              "martyr_fund",
              "local_administration",
              "reconstruction",
              "total",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "vehicle_id",
          },
          pricingBatch
        );

        count += vehiclesBatch.length;
      }

      console.log(`✅ foreign_vehicles migrated: ${count}`);
    }

    console.log("✅ vehicles done");
  }

  // ===== 5) payments =====
  {
    console.log("➡️ Migrating payments...");
    const cursor = db.collection("payments").find({});
    const batch: any[] = [];
    let count = 0;

    for await (const p of cursor) {
      const id = uuidFromObjectId(p._id);
      const vehicleId = p.vehicleId ? uuidFromObjectId(p.vehicleId) : null;
      const processedBy = p.processedBy ? uuidFromObjectId(p.processedBy) : null;

      batch.push({
        id,
        legacy_mongo_id: p._id.toString(),
        vehicle_id: vehicleId,
        processed_by: processedBy,
        vehicle_model: toText(p.vehicleModel),
        policy_number: toText(p.policyNumber),
        amount: toBigIntNumber(p.amount) ?? 0,
        payment_method: toText(p.paymentMethod),
        payment_status: toText(p.paymentStatus),
        receipt_number: toText(p.receiptNumber),
        paid_by: toText(p.paidBy),
        payer_phone: toText(p.payerPhone),
        payment_date: toDate(p.paymentDate),
        created_at: toDate(p.createdAt),
        updated_at: toDate(p.updatedAt),
        raw_doc: p,
      });

      if (batch.length >= BATCH_SIZE) {
        await bulkUpsert(
          pg,
          {
            table: "payments",
            columns: [
              "id",
              "legacy_mongo_id",
              "vehicle_id",
              "processed_by",
              "vehicle_model",
              "policy_number",
              "amount",
              "payment_method",
              "payment_status",
              "receipt_number",
              "paid_by",
              "payer_phone",
              "payment_date",
              "created_at",
              "updated_at",
              "raw_doc",
            ],
            jsonbCols: new Set(["raw_doc"]),
            conflictTarget: "legacy_mongo_id",
          },
          batch
        );
        count += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length) {
      await bulkUpsert(
        pg,
        {
          table: "payments",
          columns: [
            "id",
            "legacy_mongo_id",
            "vehicle_id",
            "processed_by",
            "vehicle_model",
            "policy_number",
            "amount",
            "payment_method",
            "payment_status",
            "receipt_number",
            "paid_by",
            "payer_phone",
            "payment_date",
            "created_at",
            "updated_at",
            "raw_doc",
          ],
          jsonbCols: new Set(["raw_doc"]),
          conflictTarget: "legacy_mongo_id",
        },
        batch
      );
      count += batch.length;
    }

    console.log(`✅ payments done: ${count}`);
  }

  // ===== 6) mandatory_policies =====
  {
    console.log("➡️ Migrating mandatory_policies...");
    const cursor = db.collection("mandatory_policies").find({});
    const batch: any[] = [];
    let count = 0;

    for await (const m of cursor) {
      const id = uuidFromObjectId(m._id);

      const insured = m.insured || {};
      const issueCenter = m.issueCenter || {};
      const policy = m.policy || {};
      const amounts = m.amounts || {};
      const vehicle = m.vehicle || {};
      const source = m.source || {};
      const raw = m.raw || {};

      batch.push({
        id,
        legacy_mongo_id: m._id.toString(),

        serial_key: toBigIntNumber(m.serialKey) ?? 0,
        contract_no: toBigIntNumber(m.contractNo),
        receipt_no: toText(m.receiptNo),
        company_name: toText(m.companyName),
        insurance_company_id: null, // نتركها null الآن، ويمكن تحديثها بمطابقة الاسم لاحقاً

        issue_center_code: toInt(m.issueCenterCode) ?? toInt(issueCenter.code),
        issue_center_name: toText(m.issueCenterName) ?? toText(issueCenter.name),
        issue_center_raw: toText(issueCenter.raw),

        duration_months: toInt(policy.durationMonths),
        policy_created_at: toDate(policy.createdAt),
        policy_start_at: toDate(policy.startAt),
        policy_end_at: toDate(policy.endAt),
        policy_paid_at: toDate(policy.paidAt),
        policy_is_paid: policy.isPaid === undefined ? null : !!policy.isPaid,
        e_code: toText(policy.eCode),
        contract_kind_code: toInt(policy.contractKindCode),

        external_key: toText(raw["المفتاح"]),
        contract_key_hex: toText(raw["مفتاح العقد"]),

        insured_name: toText(insured.name),
        insured_full_name: toText(insured.fullName),
        insured_father_name: toText(insured.fatherName),
        insured_last_name: toText(insured.lastName),
        insured_national_id: toText(insured.nationalId),
        insured_phone: toText(insured.phone),
        insured_mobile: toText(insured.mobile),
        insured_address: toText(insured.address),
        insured_city: toText(insured.city),
        insured_area: toText(insured.area),
        insured_street: toText(insured.street),

        vehicle_number: toText(m.vehicleNumber),
        vehicle_make: toText(vehicle.make),
        vehicle_model: toText(vehicle.model),
        vehicle_type_name: toText(vehicle.typeName),
        vehicle_car_name: toText(vehicle.carName),
        vehicle_manufacture_year: toInt(vehicle.manufactureYear),
        vehicle_color: toText(vehicle.color),
        vehicle_fuel_type: toText(vehicle.fuelType),
        vehicle_engine_no: toText(vehicle.engineNo),
        vehicle_chassis_no: toText(vehicle.chassisNo),
        vehicle_license_no: toText(vehicle.licenseNo),
        vehicle_engine_power: toInt(vehicle.enginePower),
        vehicle_engine_size: toInt(vehicle.engineSize),
        vehicle_category_raw: toText(vehicle.categoryRaw),
        vehicle_governorate_raw: toText(vehicle.governorateRaw),

        net_premium: toBigIntNumber(amounts.netPremium),
        stamp: toBigIntNumber(amounts.stamp),
        financial_stamp: toBigIntNumber(amounts.financialStamp),
        local_fee: toBigIntNumber(amounts.localFee),
        war_fee: toBigIntNumber(amounts.warFee),
        martyr_fee: toBigIntNumber(amounts.martyrFee),
        reconstruction_fee: toBigIntNumber(amounts.reconstructionFee),
        total: toBigIntNumber(amounts.total),
        card_price: toBigIntNumber(amounts.cardPrice),
        rescue_service_fee: toBigIntNumber(amounts.rescueServiceFee),
        full_value: toBigIntNumber(amounts.fullValue),
        company_share: toBigIntNumber(amounts.companyShare),
        union_share: toBigIntNumber(amounts.unionShare),

        source_file: toText(source.file),
        source_row_number: toInt(source.rowNumber),
        imported_at: toDate(source.importedAt),

        raw_doc: m,
        raw_fields: raw,
      });

      if (batch.length >= BATCH_SIZE) {
        await bulkUpsert(
          pg,
          {
            table: "mandatory_policies",
            columns: [
              "id",
              "legacy_mongo_id",

              "serial_key",
              "contract_no",
              "receipt_no",
              "company_name",
              "insurance_company_id",

              "issue_center_code",
              "issue_center_name",
              "issue_center_raw",

              "duration_months",
              "policy_created_at",
              "policy_start_at",
              "policy_end_at",
              "policy_paid_at",
              "policy_is_paid",
              "e_code",
              "contract_kind_code",

              "external_key",
              "contract_key_hex",

              "insured_name",
              "insured_full_name",
              "insured_father_name",
              "insured_last_name",
              "insured_national_id",
              "insured_phone",
              "insured_mobile",
              "insured_address",
              "insured_city",
              "insured_area",
              "insured_street",

              "vehicle_number",
              "vehicle_make",
              "vehicle_model",
              "vehicle_type_name",
              "vehicle_car_name",
              "vehicle_manufacture_year",
              "vehicle_color",
              "vehicle_fuel_type",
              "vehicle_engine_no",
              "vehicle_chassis_no",
              "vehicle_license_no",
              "vehicle_engine_power",
              "vehicle_engine_size",
              "vehicle_category_raw",
              "vehicle_governorate_raw",

              "net_premium",
              "stamp",
              "financial_stamp",
              "local_fee",
              "war_fee",
              "martyr_fee",
              "reconstruction_fee",
              "total",
              "card_price",
              "rescue_service_fee",
              "full_value",
              "company_share",
              "union_share",

              "source_file",
              "source_row_number",
              "imported_at",

              "raw_doc",
              "raw_fields",
            ],
            jsonbCols: new Set(["raw_doc", "raw_fields"]),
            conflictTarget: "legacy_mongo_id",
          },
          batch
        );
        count += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length) {
      await bulkUpsert(
        pg,
        {
          table: "mandatory_policies",
          columns: [
            "id",
            "legacy_mongo_id",

            "serial_key",
            "contract_no",
            "receipt_no",
            "company_name",
            "insurance_company_id",

            "issue_center_code",
            "issue_center_name",
            "issue_center_raw",

            "duration_months",
            "policy_created_at",
            "policy_start_at",
            "policy_end_at",
            "policy_paid_at",
            "policy_is_paid",
            "e_code",
            "contract_kind_code",

            "external_key",
            "contract_key_hex",

            "insured_name",
            "insured_full_name",
            "insured_father_name",
            "insured_last_name",
            "insured_national_id",
            "insured_phone",
            "insured_mobile",
            "insured_address",
            "insured_city",
            "insured_area",
            "insured_street",

            "vehicle_number",
            "vehicle_make",
            "vehicle_model",
            "vehicle_type_name",
            "vehicle_car_name",
            "vehicle_manufacture_year",
            "vehicle_color",
            "vehicle_fuel_type",
            "vehicle_engine_no",
            "vehicle_chassis_no",
            "vehicle_license_no",
            "vehicle_engine_power",
            "vehicle_engine_size",
            "vehicle_category_raw",
            "vehicle_governorate_raw",

            "net_premium",
            "stamp",
            "financial_stamp",
            "local_fee",
            "war_fee",
            "martyr_fee",
            "reconstruction_fee",
            "total",
            "card_price",
            "rescue_service_fee",
            "full_value",
            "company_share",
            "union_share",

            "source_file",
            "source_row_number",
            "imported_at",

            "raw_doc",
            "raw_fields",
          ],
          jsonbCols: new Set(["raw_doc", "raw_fields"]),
          conflictTarget: "legacy_mongo_id",
        },
        batch
      );
      count += batch.length;
    }

    console.log(`✅ mandatory_policies done: ${count}`);
  }

  // ===== 7) Optional: ربط mandatory_policies.insurance_company_id عبر تطابق الاسم (إجراء سريع) =====
  {
    console.log("➡️ Linking mandatory_policies -> insurance_companies by normalized name (best-effort) ...");
    // نعمل تحديث بسيط داخل SQL: نطابق على normalize مسبقاً داخل الشركات.
    // بما أن mandatory_policies لا يملك name_normalized عمود، سنقوم بتحديث عبر LIKE/replace بسيط.
    // الأفضل تعمل normalize في السكربت وتضيف عمود company_name_normalized لو تحب لاحقاً.
    // الآن: نتركها بدون ربط تلقائي حتى لا يحصل ربط خاطئ.
    console.log("ℹ️ Skipped auto-link to avoid wrong matches (we can add normalized column if you want).");
  }

  await pg.end();
  await mongo.close();
  console.log("🎉 Migration completed.");
}

run().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
