// utils/tenant.ts
export function resolveCenterScope(req: any) {
  const u = req.user!;
  if (u.role === "admin") {
    // admin اختياري يمرر centerId بالـ query للتصفية
    return req.query.centerId ? String(req.query.centerId) : null;
  }
  // غير admin: يفرض مركز المستخدم
  return u.centerId ? String(u.centerId) : null;
}
