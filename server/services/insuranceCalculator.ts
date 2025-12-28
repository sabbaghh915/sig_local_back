// server/services/insuranceCalculator.ts
import { baseNetPremiums } from "../config/baseNetPremiums";

type InsuranceType = "internal" | "border";

type Classification = 0 | 1 | 2 | 3; // نفس الحاسبة: 0 عادي، 1 حكومي، 2 طابع مخفض، 3 معفى الطابع
type Period = 12 | 6 | 3;            // أشهر

const classificationModifiers: Record<Classification, { netMultiplier: number; stampMultiplier: number }> = {
  0: { netMultiplier: 1.0, stampMultiplier: 1.0 },
  1: { netMultiplier: 0.8, stampMultiplier: 0.8 },
  2: { netMultiplier: 1.0, stampMultiplier: 0.5 },
  3: { netMultiplier: 1.0, stampMultiplier: 0.0 },
};

const periodMultipliers: Record<Period, number> = {
  12: 1.0,
  6: 0.6,
  3: 0.3,
};

function ceilingTo(value: number, step = 100) {
  return Math.ceil(value / step) * step;
}

function round0(value: number) {
  return Math.round(value);
}

export function calculateInsurancePremium(input: {
  insuranceType: InsuranceType;

  // ✅ internal
  vehicleType?: string;   // مثل 01a / 01b ... (حسب الحاسبة)
  category?: "01" | "02" | "03" | "04"; // خاص بـ internal
  classification?: Classification;
  period?: Period;

  // ✅ border
  borderType?: string; // tourist / motorcycle / bus / other
  borderPeriod?: Period;
}) {
  const warFee = 300;
  const martyrFee = 200;

  if (input.insuranceType === "internal") {
    const vehicleType = input.vehicleType;
    const category = input.category;
    const classification = (input.classification ?? 0) as Classification;
    const period = (input.period ?? 12) as Period;

    if (!vehicleType || !category) {
      throw new Error("Missing vehicleType/category for internal insurance");
    }

    const key = `${vehicleType}-${category}` as keyof typeof baseNetPremiums.internal;
    const annualNet = baseNetPremiums.internal[key];

    if (annualNet == null) {
      throw new Error(`No base net premium found for key: ${String(key)}`);
    }

    const mod = classificationModifiers[classification];
    const netPremium = round0(annualNet * mod.netMultiplier * periodMultipliers[period]);

    // ✅ نفس حاسبتك: stampBase = CEILING(net*0.03 + 5000, 100)
    const stampBase = ceilingTo(netPremium * 0.03 + 5000, 100);

    // مهم: في ملف الـ HTML عندك stampMultiplier موجود لكنه غير مستخدم
    // هنا طبقناه ليصبح "طابع مخفض/معفى" فعّال:
    const stampFee = ceilingTo(stampBase * mod.stampMultiplier, 100);

    const localFee = ceilingTo((stampFee + warFee) * 0.05, 100);
    const reconFee = ceilingTo(stampFee * 0.10, 100);

    // ✅ نفس الحاسبة: local & recon على netPremium
    //const localFee = ceilingTo(netPremium * 0.05, 100);
    //const reconFee = ceilingTo(netPremium * 0.10, 100);

    const total = netPremium + stampFee + warFee + martyrFee + localFee + reconFee;

    return {
      insuranceType: "internal" as const,
      inputs: { vehicleType, category, classification, period },
      breakdown: { netPremium, stampFee, warFee, martyrFee, localFee, reconFee },
      total,
    };
  }

  // border
  const borderType = input.borderType;
  const borderPeriod = (input.borderPeriod ?? 12) as Period;

  if (!borderType) {
    throw new Error("Missing borderType for border insurance");
  }

  const key = `${borderType}-${borderPeriod}` as keyof typeof baseNetPremiums.border;
  const netPremium = baseNetPremiums.border[key];

  if (netPremium == null) {
    throw new Error(`No border net premium found for key: ${String(key)}`);
  }

  // ✅ نفس حاسبتك: stamp = CEILING(net*0.03 + 1000, 100)
  const stampBase = ceilingTo(netPremium * 0.03 + 5000, 100);

    // مهم: في ملف الـ HTML عندك stampMultiplier موجود لكنه غير مستخدم
    // هنا طبقناه ليصبح "طابع مخفض/معفى" فعّال:
  const stampFee = ceilingTo(stampBase, 100);

  // حسب الحاسبة: local & recon = 0 للحدودي
  const localFee = ceilingTo((stampFee + warFee) * 0.05, 100);;
  const reconFee = ceilingTo(stampFee * 0.10, 100);

  const total = netPremium + stampFee + warFee + martyrFee + localFee + reconFee;

  return {
    insuranceType: "border" as const,
    inputs: { borderType, borderPeriod },
    breakdown: { netPremium, stampFee, warFee, martyrFee, localFee, reconFee },
    total,
  };
}
