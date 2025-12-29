import mongoose, { Schema, Document, Types } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  username: string;
  password: string;
  email: string;
  fullName: string;

  role: "admin" | "assistant_admin" | "employee";
  permissions: string[];

  employeeId?: string;
  phoneNumber?: string;

  isActive: boolean;

  center?: Types.ObjectId | null;

  lastLoginIp?: string;
  lastLoginAt?: Date | null;

  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },

    // ✅ الأفضل أمنياً: لا تُرجع password افتراضياً
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    fullName: {
      type: String,
      required: true,
    },

    employeeId: {
      type: String,
      unique: true,
      sparse: true,
    },

    phoneNumber: {
      type: String,
    },

    center: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null },

    isActive: {
      type: Boolean,
      default: true,
    },

    permissions: { type: [String], default: [] },

    role: {
      type: String,
      enum: ["admin", "assistant_admin", "employee"],
      default: "employee",
    },

    lastLoginIp: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ helper: تحقق إذا كلمة المرور أصلاً bcrypt hash (حتى ما نعمل hash مرتين)
const looksLikeBcryptHash = (v: any) => {
  if (typeof v !== "string") return false;
  // bcrypt hash عادة يبدأ بـ $2a$ أو $2b$ أو $2y$ وطوله ~60
  return /^\$2[aby]\$\d{2}\$/.test(v) && v.length >= 55;
};

// Hash password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  // ✅ لو كانت hash جاهزة (جايه من route مثلاً) لا تعيد hashing
  if (looksLikeBcryptHash(this.password)) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  // ملاحظة: لازم تستدعي .select("+password") أو يكون select:false كما فوق
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
