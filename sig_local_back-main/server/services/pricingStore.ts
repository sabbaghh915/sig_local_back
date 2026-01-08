import PricingConfig from "../models/PricingConfig";

let cache: any = null;
let cacheAt = 0;

function mapGet(m: any, key: string) {
  if (!m) return undefined;
  if (typeof m.get === "function") return m.get(key);
  return m[key];
}

export async function getActivePricingConfig() {
  // ✅ كاش 30 ثانية لتخفيف الضغط
  if (cache && Date.now() - cacheAt < 30_000) return cache;

  const cfg = await PricingConfig.findOne().sort({ updatedAt: -1 });
  if (!cfg) throw new Error("لا يوجد PricingConfig في قاعدة البيانات");

  cache = cfg;
  cacheAt = Date.now();
  return cfg;
}

export function getPriceFromCfg(cfg: any, scope: "internal" | "border", key: string) {
  const obj = scope === "internal" ? cfg.internal : cfg.border;
  return Number(mapGet(obj, key) ?? 0);
}

export function invalidatePricingCache() {
  cache = null;
  cacheAt = 0;
}
