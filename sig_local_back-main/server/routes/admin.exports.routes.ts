import { Router, Request, Response } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Parser as Json2csvParser } from "json2csv";

import Payment from "../models/Payment";
import Center from "../models/Center";
import User from "../models/User";
import InsuranceCompany from "../models/InsuranceCompany";

import { protect } from "../middleware/auth";

// إذا عندك requirePermission استخدمه. إذا لا، خليه مثل هذا:
const requireExportAccess = (req: any, res: any, next: any) => {
  // admin دائماً
  if (req.user?.role === "admin") return next();
  // assistant_admin يحتاج export_reports
  const perms: string[] = req.user?.permissions || [];
  if (req.user?.role === "assistant_admin" && perms.includes("export_reports")) return next();
  return res.status(403).json({ success: false, message: "Forbidden" });
};

const router = Router();

type Format = "csv" | "xlsx" | "pdf";

function asFormat(x: any): Format {
  const v = String(x || "").toLowerCase();
  if (v === "csv" || v === "xlsx" || v === "pdf") return v;
  return "csv";
}

function setDownloadHeaders(res: Response, mime: string, filename: string) {
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

// ✅ تحويل “rows + columns” إلى CSV/XLSX/PDF
async function sendCSV(res: Response, filename: string, rows: any[]) {
  // Excel يحب BOM لليونيكود
  const parser = new Json2csvParser({ excelStrings: true });
  const csv = "\uFEFF" + parser.parse(rows);
  setDownloadHeaders(res, "text/csv; charset=utf-8", filename);
  return res.status(200).send(csv);
}

async function sendXLSX(res: Response, filename: string, rows: any[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  const cols = rows.length ? Object.keys(rows[0]) : [];
  ws.columns = cols.map((k) => ({ header: k, key: k, width: Math.max(12, Math.min(40, k.length + 6)) }));

  rows.forEach((r) => ws.addRow(r));

  setDownloadHeaders(
    res,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename
  );

  const buffer = await wb.xlsx.writeBuffer();
  return res.status(200).send(Buffer.from(buffer));
}

async function sendPDF(res: Response, filename: string, title: string, rows: any[]) {
  setDownloadHeaders(res, "application/pdf", filename);

  const doc = new PDFDocument({ size: "A4", margin: 36 });
  doc.pipe(res);

  // ⚠️ دعم عربي (اختياري):
  // إذا وضعت خط عربي في: server/assets/fonts/Amiri-Regular.ttf
  // doc.font("server/assets/fonts/Amiri-Regular.ttf");
  // وإلا سيعمل لكن العربية قد لا تظهر صح.

  doc.fontSize(16).text(title, { align: "center" });
  doc.moveDown(1);

  const keys = rows.length ? Object.keys(rows[0]) : [];
  doc.fontSize(10);

  // جدول بسيط (سطر لكل سجل)
  rows.slice(0, 3000).forEach((r, idx) => {
    doc.text(`(${idx + 1})`, { continued: true });
    doc.text("  " + keys.map((k) => `${k}: ${String(r[k] ?? "")}`).join(" | "));
    doc.moveDown(0.4);
    if (doc.y > 760) doc.addPage();
  });

  doc.end();
}

// Fetchers لكل صفحة
async function fetchRows(entity: string, req: Request) {
  const { from, to, q, role } = req.query as any;

  if (entity === "payments") {
    const filter: any = {};
    if (from || to) filter.paymentDate = {};
    if (from) filter.paymentDate.$gte = new Date(from);
    if (to) filter.paymentDate.$lte = new Date(to);
    if (q) filter.$or = [{ policyNumber: String(q) }, { receiptNumber: String(q) }, { paidBy: String(q) }];

    const items = await Payment.find(filter)
      .sort({ paymentDate: -1 })
      .limit(200000)
      .lean();

    return items.map((p: any) => ({
      receiptNumber: p.receiptNumber,
      policyNumber: p.policyNumber,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      paymentStatus: p.paymentStatus,
      paidBy: p.paidBy,
      payerPhone: p.payerPhone,
      paymentDate: p.paymentDate,
    }));
  }

  if (entity === "centers") {
    const items = await Center.find({}).sort({ code: 1 }).limit(5000).lean();
    return items.map((c: any) => ({
      code: c.code,
      name: c.name,
      province: c.province,
      ip: c.ip,
      isActive: c.isActive,
    }));
  }

  if (entity === "insurance-companies") {
    const items = await InsuranceCompany.find({}).sort({ name: 1 }).limit(5000).lean();
    return items.map((x: any) => ({
      name: x.name,
      sharePercent: x.sharePercent,
      isActive: x.isActive,
      createdAt: x.createdAt,
    }));
  }

  if (entity === "users") {
    const filter: any = {};
    if (role) filter.role = role;
    if (q) filter.$or = [{ username: String(q) }, { email: String(q) }, { fullName: String(q) }];

    const items = await User.find(filter).sort({ createdAt: -1 }).limit(50000).lean();
    return items.map((u: any) => ({
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      employeeId: u.employeeId,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
  }

  // إذا ما عرفنا entity
  return null;
}

router.get("/admin/exports/:entity", protect, requireExportAccess, async (req: Request, res: Response) => {
  try {
    const entity = String(req.params.entity || "").toLowerCase();
    const format = asFormat((req.query as any).format);

    const rows = await fetchRows(entity, req);
    if (!rows) {
      return res.status(400).json({ success: false, message: `Unknown entity: ${entity}` });
    }

    const baseName = `${entity}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") return sendCSV(res, `${baseName}.csv`, rows);
    if (format === "xlsx") return sendXLSX(res, `${baseName}.xlsx`, rows);
    return sendPDF(res, `${baseName}.pdf`, `Export: ${entity}`, rows);
  } catch (e: any) {
    console.error("Export error:", e);
    return res.status(500).json({ success: false, message: e.message || "Export failed" });
  }
});

export default router;
