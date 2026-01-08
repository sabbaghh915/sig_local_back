import PolicyRecord from "../models/PolicyRecord";

const asId = (v: any) => (typeof v === "string" ? v : v?._id || v);

export async function upsertRecordFromVehicle(vehicleModel: "SyrianVehicle"|"ForeignVehicle", v: any) {
  const vehicleId = asId(v?._id);
  if (!vehicleId) return;

  await PolicyRecord.updateOne(
    { vehicleId, vehicleModel },
    {
      $set: {
        ownerName: v.ownerName,
        nationalId: v.nationalId,
        phoneNumber: v.phoneNumber,
        address: v.address,
        plateNumber: v.plateNumber,
        chassisNumber: v.chassisNumber,
        engineNumber: v.engineNumber,
        brand: v.brand,
        model: v.model,
        year: v.year,
        color: v.color?.name || v.colorName || v.color,
        manufacturer: v.manufacturer || v.manufacturerName || "",
        coverage: v.coverage,
        status: v.status || "active",
        centerId: v.centerId || null,
      },
    },
    { upsert: true }
  );
}

export async function upsertRecordFromPayment(p: any) {
  const vehicleId = asId(p.vehicleId);
  const vehicleModel = p.vehicleModel as "SyrianVehicle"|"ForeignVehicle";
  if (!vehicleId || !vehicleModel) return;

  await PolicyRecord.updateOne(
    { vehicleId, vehicleModel },
    {
      $set: {
        paymentId: asId(p._id),
        policyNumber: p.policyNumber,
        receiptNumber: p.receiptNumber,
        amount: p.amount ?? p.breakdown?.total,
        paymentStatus: p.paymentStatus,
        paymentMethod: p.paymentMethod,
        paidBy: p.paidBy,
        payerPhone: p.payerPhone,
        center: p.center || null,
        insuranceCompany: p.insuranceCompany || null,
        processedBy: p.processedBy || null,
        issuedAt: p.issuedAt || null,
        policyStartAt: p.policyStartAt || null,
        policyEndAt: p.policyEndAt || null,
        pricingInput: p.pricingInput,
        breakdown: p.breakdown,
      },
    },
    { upsert: true }
  );
}
