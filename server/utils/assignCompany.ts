function pickCompanyWeighted(companies: any[]) {
  const active = companies.filter((c) => c.isActive && c.sharePercent > 0);
  const total = active.reduce((a, c) => a + c.sharePercent, 0);

  if (!active.length || total <= 0) return null;

  const r = Math.random() * total;
  let acc = 0;
  for (const c of active) {
    acc += c.sharePercent;
    if (r <= acc) return c;
  }
  return active[active.length - 1];
}
