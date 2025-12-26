import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  password: string;
  email: string;
  fullName: string;
  role: 'admin' | 'employee';
  employeeId?: string;
  phoneNumber?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  centerId?: Types.ObjectId | null;
  comparePassword(candidatePassword: string): Promise<boolean>;
  lastLoginIp?: string;
  lastLoginAt?: Date | null;

}

const UserSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
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
    role: {
      type: String,
      enum: ['admin', 'employee'],
      default: 'employee',
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
    lastLoginIp: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },


  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);