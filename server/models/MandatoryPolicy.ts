import { Schema, model, models } from "mongoose";

const CodeNameSchema = new Schema(
  {
    raw: { type: String },
    code: { type: Number },
    name: { type: String },
  },
  { _id: false }
);

const MandatoryPolicySchema = new Schema(
  {
    // مفتاح فريد داخل الملف (أفضل من رقم العقد)
    serialKey: { type: Number, required: true, unique: true, index: true }, // "مفتاح تسلسلي"

    contractNo: { type: Number, index: true }, // "رقم العقد"
    vehicleNumber: { type: String, index: true }, // "رق المركبة"
    receiptNo: { type: String, index: true }, // "ايصال التسديد"

    issueCenter: { type: CodeNameSchema }, // "مركز الاصدار"
    issueCenterCode: { type: Number }, // "رمز المركز"
    issueCenterName: { type: String }, // "اسم المركز"
    companyName: { type: String }, // "اسم الشركة"

    insured: {
      name: { type: String }, // "اسم المؤمن له"
      fullName: { type: String }, // "الاسم الكامل"
      fatherName: { type: String }, // "اسم الاب"
      lastName: { type: String }, // "الكنية"
      nationalId: { type: String, index: true }, // "الرقم الوطني"
      phone: { type: String }, // "رقم هاتفه"
      mobile: { type: String }, // "رقم الموبايل"
      address: { type: String }, // "العنوان الكامل"
      city: { type: String }, // "المدينة"
      area: { type: String }, // "المنطقة"
      street: { type: String }, // "الشارع"
    },

    vehicle: {
      make: { type: String, index: true }, // "الصانع"
      model: { type: String, index: true }, // "موديل السيارة"
      typeName: { type: String }, // "النوع" (مثل: سياحية... / دراجة...)
      carName: { type: String }, // "نوع السيارة" (مثل: ريو/سيراتو...)
      manufactureYear: { type: Number, index: true }, // "سنة الصنع"
      color: { type: String }, // "لون المركبة"
      fuelType: { type: String }, // "نوع الوقود"
      engineNo: { type: String, index: true }, // "رقم المحرك"
      chassisNo: { type: String, index: true }, // "رقم الهيكل"
      licenseNo: { type: String, index: true }, // "رقم الرخصة"
      enginePower: { type: Number }, // "قوة المحرك"
      engineSize: { type: Number }, // "حجم المحرك"
      categoryRaw: { type: String }, // "الفئة"
      governorateRaw: { type: String }, // العمود المكتوب عندك "جنسية المركبة" لكنه يظهر كـ محافظة/منطقة في البيانات
    },

    policy: {
      durationMonths: { type: Number, index: true }, // "فترة العقد"
      createdAt: { type: Date, index: true }, // "تاريخ انشاء العقد"
      startAt: { type: Date, index: true }, // "تاريخ بدء العقد"
      endAt: { type: Date, index: true }, // "تاريخ انتهاء العقد"
      paidAt: { type: Date, index: true }, // "تاريخ التسديد"
      isPaid: { type: Boolean, index: true }, // "تم التسديد"
      eCode: { type: String }, // "الرمز الالكتروني"
      contractKindCode: { type: Number }, // "عبور / إقامة" (كما هو)
    },

    amounts: {
      netPremium: { type: Number, index: true }, // "البدل"
      stamp: { type: Number }, // "رسم الطابع"
      financialStamp: { type: Number }, // "الطابع المالي"
      localFee: { type: Number }, // "الادارة المحلية"
      warFee: { type: Number }, // "مجهود حربي"
      martyrFee: { type: Number }, // "طابع الشهيد"
      reconstructionFee: { type: Number }, // "رسم اعمار"
      total: { type: Number, index: true }, // "المبلغ الاجمالي"
      cardPrice: { type: Number }, // "سعر البطاقة"
      rescueServiceFee: { type: Number }, // "ق.خدمة.انقاذ"
      fullValue: { type: Number }, // "القيمة الكاملة"
      companyShare: { type: Number }, // "حصة الشركة"
      unionShare: { type: Number }, // "حصة الاتحاد"
    },

    source: {
      file: { type: String },
      rowNumber: { type: Number },
      importedAt: { type: Date, default: () => new Date() },
    },

    // إذا بدك تحتفظ بكل الأعمدة كما هي (مفيد جداً)
    raw: { type: Schema.Types.Mixed },
  },
  { versionKey: false }
);

export const MandatoryPolicy =
  models.MandatoryPolicy || model("MandatoryPolicy", MandatoryPolicySchema, "mandatory_policies");
