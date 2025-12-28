import "dotenv/config";
import path from "path";
import mongoose from "mongoose";
import XLSX from "xlsx";

type AnyObj = Record<string, any>;

const toStr = (v: any) => (v === null || v === undefined ? "" : String(v).trim());

const toNum = (v: any) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const toDate = (v: any) => (v instanceof Date && !isNaN(v.getTime()) ? v : null);

const toBoolPaid = (v: any) => {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return v !== 0;
  const s = toStr(v).toLowerCase();
  if (!s) return false;
  return s === "1" || s.includes("نعم") || s.includes("تم") || s.includes("paid") || s === "true";
};

function normalizePlateNumber(v: any) {
  const s = toStr(v);
  return s.replace(/\s+/g, " ").trim();
}

// بلد اللوحة: نرجّع SY بدل null لتجنب مشاكل الـ unique index
function normalizeCountry(raw: any) {
  const s = toStr(raw);
  if (!s) return "SY";
  const low = s.toLowerCase();
  if (low.includes("سور") || low === "sy" || low === "syr" || low.includes("syria")) return "SY";
  return s;
}

function normalizeReceiptNumber(v: any) {
  // بعض الإكسل يطلع رقم الإيصال كـ 12345.0
  let s = toStr(v);
  if (!s) return "";
  // إذا رقم عشري من الإكسل
  if (/^\d+(\.0+)?$/.test(s)) s = String(Math.trunc(Number(s)));
  return s.trim();
}

function isEmptyRow(ws: XLSX.WorkSheet, r: number, cStart: number, cEnd: number) {
  for (let c = cStart; c <= cEnd; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== "") return false;
  }
  return true;
}

function buildHeaders(ws: XLSX.WorkSheet, range: XLSX.Range) {
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    headers.push(toStr(cell?.v));
  }
  return headers;
}

function colIndex(headers: string[], name: string) {
  return headers.findIndex((h) => h === name);
}

function getCell(ws: XLSX.WorkSheet, r: number, c: number) {
  if (c < 0) return null;
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell?.v ?? null;
}

function makeRawRow(ws: XLSX.WorkSheet, r: number, range: XLSX.Range, headers: string[]) {
  const raw: AnyObj = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const h = headers[c] || `col_${c}`;
    raw[h] = ws[XLSX.utils.encode_cell({ r, c })]?.v ?? null;
  }
  return raw;
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("❌ Missing MONGO_URI in .env");

  const fileArg = process.argv[2];
  if (!fileArg) {
    throw new Error('❌ Provide excel path: npx tsx .\\scripts\\importMandatoryPolicies.ts "PATH_TO_XLS"');
  }
  const filePath = path.resolve(fileArg);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const ref = ws["!ref"];
  if (!ref) throw new Error("❌ Sheet is empty (!ref missing)");
  const range = XLSX.utils.decode_range(ref);

  const headers = buildHeaders(ws, range);

  const IDX = {
    serialKey: colIndex(headers, "مفتاح تسلسلي"),
    contractNo: colIndex(headers, "رقم العقد"),
    vehicleNo: colIndex(headers, "رق المركبة"),
    plateCountryRaw: colIndex(headers, "جنسية المركبة"),

    ownerName: colIndex(headers, "الاسم الكامل"),
    ownerShort: colIndex(headers, "اسم المؤمن له"),
    nationalId: colIndex(headers, "الرقم الوطني"),
    phone: colIndex(headers, "رقم هاتفه"),
    mobile: colIndex(headers, "رقم الموبايل"),

    make: colIndex(headers, "الصانع"),
    model: colIndex(headers, "موديل السيارة"),
    carName: colIndex(headers, "نوع السيارة"),
    typeName: colIndex(headers, "النوع"),
    year: colIndex(headers, "سنة الصنع"),
    color: colIndex(headers, "لون المركبة"),
    fuel: colIndex(headers, "نوع الوقود"),
    engineNo: colIndex(headers, "رقم المحرك"),
    chassisNo: colIndex(headers, "رقم الهيكل"),
    licenseNo: colIndex(headers, "رقم الرخصة"),

    duration: colIndex(headers, "فترة العقد"),
    startAt: colIndex(headers, "تاريخ بدء العقد"),
    endAt: colIndex(headers, "تاريخ انتهاء العقد"),
    createdAt: colIndex(headers, "تاريخ انشاء العقد"),
    paidAt: colIndex(headers, "تاريخ التسديد"),
    isPaid: colIndex(headers, "تم التسديد"),

    receiptNo: colIndex(headers, "ايصال التسديد"), // من الإكسل
    eCode: colIndex(headers, "الرمز الالكتروني"),

    total: colIndex(headers, "المبلغ الاجمالي"),
    net: colIndex(headers, "البدل"),
    stamp: colIndex(headers, "رسم الطابع"),
    finStamp: colIndex(headers, "الطابع المالي"),
    local: colIndex(headers, "الادارة المحلية"),
    war: colIndex(headers, "مجهود حربي"),
    martyr: colIndex(headers, "طابع الشهيد"),
    recon: colIndex(headers, "رسم اعمار"),
  };

  if (IDX.serialKey < 0 || IDX.vehicleNo < 0) {
    throw new Error("❌ Missing required columns: 'مفتاح تسلسلي' أو 'رق المركبة'");
  }

  const foreignCol = db.collection("foreign_vehicles");
  const syrianCol = db.collection("syrian_vehicles");
  const paymentsCol = db.collection("payments");

  const BATCH = 1000;

  // dedup داخل batch
  const foreignMap = new Map<string, AnyObj>();
  const syrianMap = new Map<string, AnyObj>();
  const paymentMap = new Map<string, AnyObj>(); // key = receiptNumber

  let processed = 0;
  let skippedPaymentsNoReceipt = 0;

  let foreignUp = 0;
  let syrianUp = 0;
  let paymentsUp = 0;

  async function flush() {
    if (foreignMap.size) {
      const ops = Array.from(foreignMap.values()).map((x) => ({ updateOne: x }));
      const res = await foreignCol.bulkWrite(ops as any, { ordered: false });
      foreignUp += (res.upsertedCount || 0) + (res.modifiedCount || 0);
      foreignMap.clear();
    }
    if (syrianMap.size) {
      const ops = Array.from(syrianMap.values()).map((x) => ({ updateOne: x }));
      const res = await syrianCol.bulkWrite(ops as any, { ordered: false });
      syrianUp += (res.upsertedCount || 0) + (res.modifiedCount || 0);
      syrianMap.clear();
    }
    if (paymentMap.size) {
      const ops = Array.from(paymentMap.values()).map((x) => ({ updateOne: x }));
      const res = await paymentsCol.bulkWrite(ops as any, { ordered: false });
      paymentsUp += (res.upsertedCount || 0) + (res.modifiedCount || 0);
      paymentMap.clear();
    }
  }

  for (let r = 1; r <= range.e.r; r++) {
    if (isEmptyRow(ws, r, range.s.c, range.e.c)) continue;

    const serialKey = toNum(getCell(ws, r, IDX.serialKey));
    if (!serialKey) continue;

    const plateNumber = normalizePlateNumber(getCell(ws, r, IDX.vehicleNo));
    if (!plateNumber) continue;

    const plateCountry = normalizeCountry(getCell(ws, r, IDX.plateCountryRaw));
    const isForeign = plateCountry !== "SY";

    const ownerName =
      toStr(getCell(ws, r, IDX.ownerName)) || toStr(getCell(ws, r, IDX.ownerShort)) || null;

    const receiptNumber = normalizeReceiptNumber(getCell(ws, r, IDX.receiptNo)); // ✅ هذا اللي عليه index

    const doc: AnyObj = {
      vehicleType: isForeign ? "foreign" : "syrian",

      plateNumber,
      plateCountry: isForeign ? plateCountry : "SY",

      ownerName,
      nationalId: toStr(getCell(ws, r, IDX.nationalId)) || null,
      phone: toStr(getCell(ws, r, IDX.phone)) || toStr(getCell(ws, r, IDX.mobile)) || null,

      make: toStr(getCell(ws, r, IDX.make)) || null,
      model: toStr(getCell(ws, r, IDX.model)) || null,
      carName: toStr(getCell(ws, r, IDX.carName)) || null,
      typeName: toStr(getCell(ws, r, IDX.typeName)) || null,
      manufactureYear: toNum(getCell(ws, r, IDX.year)),
      color: toStr(getCell(ws, r, IDX.color)) || null,
      fuelType: toStr(getCell(ws, r, IDX.fuel)) || null,
      engineNumber: toStr(getCell(ws, r, IDX.engineNo)) || null,
      chassisNumber: toStr(getCell(ws, r, IDX.chassisNo)) || null,
      licenseNumber: toStr(getCell(ws, r, IDX.licenseNo)) || null,

      durationMonths: toNum(getCell(ws, r, IDX.duration)),
      startAt: toDate(getCell(ws, r, IDX.startAt)),
      endAt: toDate(getCell(ws, r, IDX.endAt)),
      createdAt: toDate(getCell(ws, r, IDX.createdAt)),

      // نخزن الاثنين للاحتياط (لكن المهم receiptNumber)
      receiptNumber: receiptNumber || null,
      receiptNo: receiptNumber || null,

      eCode: toStr(getCell(ws, r, IDX.eCode)) || null,

      isPaid: toBoolPaid(getCell(ws, r, IDX.isPaid)),
      paidAt: toDate(getCell(ws, r, IDX.paidAt)),

      amounts: {
        total: toNum(getCell(ws, r, IDX.total)),
        netPremium: toNum(getCell(ws, r, IDX.net)),
        stamp: toNum(getCell(ws, r, IDX.stamp)),
        financialStamp: toNum(getCell(ws, r, IDX.finStamp)),
        localFee: toNum(getCell(ws, r, IDX.local)),
        warFee: toNum(getCell(ws, r, IDX.war)),
        martyrFee: toNum(getCell(ws, r, IDX.martyr)),
        reconstructionFee: toNum(getCell(ws, r, IDX.recon)),
      },

      legacy: {
        serialKey,
        contractNo: toNum(getCell(ws, r, IDX.contractNo)),
      },

      importedFromFile: filePath,
      importedAt: new Date(),

      importRaw: makeRawRow(ws, r, range, headers),
    };

    // vehicles
    if (isForeign) {
      const key = `${doc.plateCountry}||${doc.plateNumber}`;
      foreignMap.set(key, {
        filter: { plateNumber: doc.plateNumber, plateCountry: doc.plateCountry },
        update: { $set: doc },
        upsert: true,
      });
    } else {
      const key = `SY||${doc.plateNumber}`;
      syrianMap.set(key, {
        filter: { plateNumber: doc.plateNumber },
        update: { $set: doc },
        upsert: true,
      });
    }

    // ✅ payments: لا تدخل إذا receiptNumber فاضي (لأن عندك unique index)
    if (!receiptNumber) {
      skippedPaymentsNoReceipt++;
    } else {
      // dedup في batch على receiptNumber
      paymentMap.set(receiptNumber, {
        filter: { receiptNumber }, // ✅ نفس مفتاح الـ unique index
        update: {
          $set: {
            receiptNumber,
            amount: doc?.amounts?.total ?? null,
            paidAt: doc.paidAt,
            status: doc.isPaid ? "paid" : "unpaid",
            plateNumber: doc.plateNumber,
            plateCountry: doc.plateCountry,
            legacy: { serialKey, contractNo: doc?.legacy?.contractNo ?? null },
            importedFromFile: filePath,
            importedAt: new Date(),
            importRaw: doc.importRaw,
          },
        },
        upsert: true,
      });
    }

    processed++;

    if (
      processed % BATCH === 0 ||
      foreignMap.size + syrianMap.size + paymentMap.size >= BATCH
    ) {
      await flush();
      console.log("Progress:", processed, {
        foreignUp,
        syrianUp,
        paymentsUp,
        skippedPaymentsNoReceipt,
      });
    }
  }

  await flush();

  console.log("DONE ✅", {
    processed,
    foreignUp,
    syrianUp,
    paymentsUp,
    skippedPaymentsNoReceipt,
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("FAILED ❌", e);
  process.exit(1);
});
