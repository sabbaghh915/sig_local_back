import { getActivePricingConfig, getPriceFromCfg } from "./pricingStore";

type CalcInput =
  | {
      insuranceType: "internal";
      vehicleCode: string;      // لازم تكون مثل: 01a, 02b, 08, elec-car ...
      category: string;         // لازم تكون مثل: 01/02/03/04 أو private/public...
      classification?: string;  // موجود بالفرونت لكن غير مستخدم بالتسعير الحالي
      months: number;
      electronicCard?: boolean;
      premiumService?: boolean;
      rescueService?: boolean;
    }
  | {
      insuranceType: "border";
      borderVehicleType: string; // tourist | motorcycle | bus | other
      months: number;            // 3/6/12
    };

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: any) => String(v ?? "").trim();

const CATEGORY_MAP: Record<string, string> = {
  // EN
  private: "01",
  public: "02",
  government: "03",
  rental: "04",

  // AR
  "خاصة": "01",
  "عامة": "02",
  "حكومي": "03",
  "تاجير": "04",
  "تأجير": "04",

  // already codes
  "1": "01",
  "2": "02",
  "3": "03",
  "4": "04",
  "01": "01",
  "02": "02",
  "03": "03",
  "04": "04",
};

export async function calculateInsurancePremium(input: CalcInput) {
  const cfg = await getActivePricingConfig();
  if (!cfg) throw new Error("لا يوجد تسعير فعّال حالياً");

  // DB عندك داخلي مثل 808 و 1388 => غالباً لازم * 100 لتصير بالليرة
  const INTERNAL_SCALE = Number(process.env.INTERNAL_SCALE || 1);
  const BORDER_SCALE = Number(process.env.BORDER_SCALE || 1);

  let netPremium = 0;

  if (input.insuranceType === "internal") {
    const vehicleCode = s(input.vehicleCode); // مثال صحيح: 01a
    const catRaw = s(input.category).toLowerCase();
    const catCode = CATEGORY_MAP[catRaw] ?? s(input.category); // يطلع 01..04

    // ✅ هذا هو المفتاح الحقيقي بقاعدتك
    const key = `${vehicleCode}-${catCode}`; // مثال: 01a-01

    const baseRaw = n(getPriceFromCfg(cfg, "internal", key)); // مثال: 808
    if (!baseRaw) {
      throw new Error(`لم يتم العثور على سعر (internal) للمفتاح: ${key}`);
    }

    const annualSyp = Math.round(baseRaw * INTERNAL_SCALE); // 808 * 100 = 80800
    const months = Math.max(1, n(input.months || 12));
    netPremium = Math.round((annualSyp * months) / 12);
  } else {
    const borderType = s(input.borderVehicleType);
    const months = Math.max(1, n(input.months));
    const key = `${borderType}-${months}`; // tourist-12

    const baseRaw = n(getPriceFromCfg(cfg, "border", key));
    if (!baseRaw) {
      throw new Error(`لم يتم العثور على سعر (border) للمفتاح: ${key}`);
    }

    netPremium = Math.round(baseRaw * BORDER_SCALE);
  }

  // الرسوم
  const stampFee = Math.round(netPremium * 0.01);
  const warEffort = Math.round(netPremium * 0.05);
  const localAdmin = Math.round(netPremium * 0.02);
  const martyrStamp = Math.round(netPremium * 0.01);
  const reconstruction = Math.round(netPremium * 0);

  const electronicCardFee = input.insuranceType === "internal" && input.electronicCard ? 150 : 0;
  const premiumServiceFee = input.insuranceType === "internal" && input.premiumService ? 50 : 0;
  const rescueServiceFee = input.insuranceType === "internal" && input.rescueService ? 30 : 0;

  const subtotal = netPremium + stampFee + warEffort + localAdmin + martyrStamp + reconstruction;
  const total = subtotal + electronicCardFee + premiumServiceFee + rescueServiceFee;

  return {
    total,
    breakdown: {
      netPremium,
      stampFee,
      warEffort,
      localAdmin,
      martyrStamp,
      reconstruction,
      electronicCardFee,
      premiumServiceFee,
      rescueServiceFee,
      subtotal,
      total,
    },
    pricingVersion: cfg.version,
    pricingUpdatedAt: cfg.updatedAt,
  };
}
