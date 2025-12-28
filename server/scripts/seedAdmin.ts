import mongoose from 'mongoose';
import User from '../models/User';
import dotenv from 'dotenv';

dotenv.config();

const seedAdmin = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/insurance-system';
    await mongoose.connect(mongoURI);
    
    console.log('✅ MongoDB Connected');
    
    // Check if admin already exists
    const adminExists = await User.findOne({ username: 'admin' });
    
    if (adminExists) {
      console.log('⚠️  Admin user already exists');
      process.exit(0);
    }
    
    // Create admin user
    const admin = await User.create({
      username: 'admin',
      password: 'admin123',
      email: 'admin@insurance.sy',
      fullName: 'مدير النظام',
      role: 'admin',
      employeeId: 'EMP-001',
      phoneNumber: '+963-XXX-XXXX',
    });
    
    console.log('✅ Admin user created successfully');
    console.log('Username:', admin.username);
    console.log('Password: admin123');
    console.log('Email:', admin.email);
    
    // Create sample employee
    const employee = await User.create({
      username: 'employee',
      password: 'employee123',
      email: 'employee@insurance.sy',
      fullName: 'موظف تجريبي',
      role: 'employee',
      employeeId: 'EMP-002',
      phoneNumber: '+963-XXX-XXXX',
    });
    
    console.log('\n✅ Sample employee created');
    console.log('Username:', employee.username);
    console.log('Password: employee123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

seedAdmin();
