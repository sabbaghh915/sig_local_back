/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

/**
 * Authentication Types
 */
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
  fullName: string;
  role?: 'admin' | 'employee';
  employeeId?: string;
  phoneNumber?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    fullName: string;
    role: string;
    employeeId?: string;
  };
  message?: string;
}

/**
 * Vehicle Types
 */
export interface Vehicle {
  _id?: string;
  vehicleType: 'syrian' | 'foreign';
  ownerName: string;
  nationalId: string;
  phoneNumber: string;
  address: string;
  plateNumber: string;
  chassisNumber: string;
  engineNumber?: string;
  brand: string;
  model: string;
  year: number;
  color?: string;
  fuelType?: string;
  passportNumber?: string;
  nationality?: string;
  entryDate?: Date;
  exitDate?: Date;
  customsDocument?: string;
  policyNumber?: string;
  policyDuration?: string;
  coverage?: string;
  notes?: string;
  status?: 'active' | 'expired' | 'cancelled';
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Payment Types
 */
export interface Payment {
  _id?: string;
  vehicleId: string;
  policyNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'bank-transfer' | 'check';
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  receiptNumber: string;
  paidBy: string;
  payerPhone?: string;
  notes?: string;
  paymentDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * API Response Types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  count?: number;
  message?: string;
}
