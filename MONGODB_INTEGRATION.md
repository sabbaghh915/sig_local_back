# MongoDB Integration Documentation

## Overview
This application has been successfully integrated with MongoDB to replace the previous localStorage-based data storage. The backend uses Node.js with Express and Mongoose for database operations.

## Database Setup

### MongoDB Connection
- **Database**: `insurance-system`
- **Connection**: Local MongoDB instance running on `mongodb://127.0.0.1:27017`
- **Port**: 27017

### Collections
1. **users** - User authentication and management
2. **vehicles** - Syrian and Foreign vehicle records
3. **payments** - Payment and insurance policy records

## User Management

### Default Users
Two users have been created for testing:

1. **Admin User**
   - Username: `admin`
   - Password: `admin123`
   - Email: `admin@insurance.sy`
   - Role: `admin`
   - Employee ID: `EMP-001`

2. **Employee User**
   - Username: `employee`
   - Password: `employee123`
   - Email: `employee@insurance.sy`
   - Role: `employee`
   - Employee ID: `EMP-002`

### Creating New Users
Use the registration endpoint or create users via MongoDB shell:

```bash
# Via API
curl -X POST http://localhost:3000/api/auth/register `
  -H "Content-Type: application/json" `
  -d "{\"username\":\"admin\",\"password\":\"admin123\",\"email\":\"admin@insurance.sy\",\"fullName\":\"System Admin\",\"role\":\"admin\"}"

curl -X POST http://localhost:3000/api/auth/register `
  -H "Content-Type: application/json" `
  -d "{\"username\":\"employee\",\"password\":\"employee123\",\"email\":\"employee@insurance.sy\",\"fullName\":\"Employee User\",\"role\":\"employee\"}"


curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com",
    "fullName": "Full Name",
    "role": "employee"
  }'
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info (requires auth)

### Vehicles
- `POST /api/vehicles` - Create new vehicle record
- `GET /api/vehicles` - Get all vehicles (supports filtering)
- `GET /api/vehicles/:id` - Get single vehicle
- `PUT /api/vehicles/:id` - Update vehicle
- `DELETE /api/vehicles/:id` - Delete vehicle

**Query Parameters:**
- `vehicleType` - Filter by `syrian` or `foreign`
- `status` - Filter by `active`, `expired`, or `cancelled`
- `search` - Search by plate number, owner name, national ID, or policy number

### Payments
- `POST /api/payments` - Create new payment record
- `GET /api/payments` - Get all payments (supports filtering)
- `GET /api/payments/:id` - Get single payment

**Query Parameters:**
- `status` - Filter by payment status
- `search` - Search by receipt number, policy number, or payer name

## Authentication

### JWT Token
All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### Login Flow
1. User logs in via `/api/auth/login`
2. Server returns JWT token
3. Token is stored in localStorage as `authToken`
4. Token is included in all subsequent API requests

## Frontend Updates

### Pages Modified
1. **Login.tsx** - Now uses MongoDB authentication
2. **Dashboard.tsx** - Saves Syrian vehicles to MongoDB
3. **ForeignVehicles.tsx** - Saves foreign vehicles to MongoDB
4. **Payment.tsx** - Creates payment records in MongoDB
5. **SyrianRecords.tsx** - Fetches Syrian vehicle records from MongoDB
6. **ForeignRecords.tsx** - Fetches foreign vehicle records from MongoDB

### API Service
A new API service layer has been created at `/app/client/services/api.ts` that handles:
- Authentication requests
- Vehicle CRUD operations
- Payment operations
- Token management

## Data Models

### User Model
```typescript
{
  username: string;
  password: string; // Hashed with bcrypt
  email: string;
  fullName: string;
  role: 'admin' | 'employee';
  employeeId?: string;
  phoneNumber?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Vehicle Model
```typescript
{
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
  // Foreign vehicle specific
  passportNumber?: string;
  nationality?: string;
  entryDate?: Date;
  exitDate?: Date;
  customsDocument?: string;
  // Insurance info
  policyNumber?: string;
  policyDuration?: string;
  coverage?: string;
  notes?: string;
  createdBy: ObjectId; // Reference to User
  status: 'active' | 'expired' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}
```

### Payment Model
```typescript
{
  vehicleId: ObjectId; // Reference to Vehicle
  policyNumber: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'bank-transfer' | 'check';
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  receiptNumber: string; // Auto-generated
  paidBy: string;
  payerPhone?: string;
  notes?: string;
  processedBy: ObjectId; // Reference to User
  paymentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## Running the Application

### Development Mode
```bash
npm run dev
```

This starts:
- Vite dev server on port 8080
- Express API integrated with Vite
- MongoDB connection

### Access Points
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health

## Database Management

### View Data
```bash
# Connect to MongoDB
mongosh

# Switch to insurance-system database
use insurance-system

# View users
db.users.find().pretty()

# View vehicles
db.vehicles.find().pretty()

# View payments
db.payments.find().pretty()
```

### Backup Database
```bash
mongodump --db insurance-system --out /app/mongodb-backup
```

### Restore Database
```bash
mongorestore --db insurance-system /app/mongodb-backup/insurance-system
```

## Security Notes

1. **Password Hashing**: All passwords are hashed using bcrypt with salt rounds of 10
2. **JWT Secret**: Change the JWT_SECRET in production (currently in .env)
3. **Token Expiration**: Tokens expire after 7 days by default
4. **CORS**: Currently allows all origins in development

## Environment Variables

```env
MONGODB_URI=mongodb://127.0.0.1:27017/insurance-system
JWT_SECRET=your-secret-jwt-key-change-in-production-2024
JWT_EXPIRES_IN=7d
```

## Troubleshooting

### MongoDB Not Starting
```bash
# Check MongoDB status
sudo supervisorctl status mongodb

# Restart MongoDB
sudo supervisorctl restart mongodb

# View MongoDB logs
tail -f /var/log/mongodb.out.log
```

### API Not Working
```bash
# Check application logs
tail -f /var/log/app-dev.log

# Test API health
curl http://localhost:3000/api/health
```

### Authentication Issues
```bash
# Test login endpoint
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## Migration from localStorage

All data that was previously stored in localStorage is now:
1. Saved to MongoDB when created
2. Retrieved from MongoDB when viewing records
3. Updated through API endpoints
4. Deleted through API endpoints

The application maintains backward compatibility during the transition period.
