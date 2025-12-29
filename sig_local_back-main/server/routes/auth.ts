import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { protect } from "../middleware/auth";

const router = Router();

const getClientIp = (req: any) => {
  const xf = req.headers["x-forwarded-for"];
  const ip =
    (typeof xf === "string" ? xf.split(",")[0].trim() : "") ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";

  // تنظيف ::ffff:192.168.1.5
  return String(ip).replace(/^::ffff:/, "");
};

// Generate JWT Token
const generateToken = (user: any) => {
  const id = user._id.toString();
  const centerId = user.center ? user.center.toString() : null;

  return jwt.sign(
    {
      id, // ✅ للـ protect الحالي
      sub: id, // ✅ لو عندك requireAuth يعتمد sub
      role: user.role,
      centerId,
      permissions: user.permissions || [], // ✅ مهم للـ RBAC
    },
    process.env.JWT_SECRET || "your-secret-jwt-key-change-in-production-2024",
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public (in production, should be protected)
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, password, email, fullName, role, employeeId, phoneNumber } = req.body as any;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "username and password are required",
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ username }, { email }] });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user (يفترض أن الـ schema يقوم بعمل hash لكلمة المرور)
    const user = await User.create({
      username,
      password,
      email,
      fullName,
      role: role || "employee",
      employeeId,
      phoneNumber,
      isActive: true,
    });

    // ✅ إصلاح: كان يتم تمرير string خطأ
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        employeeId: user.employeeId,
        permissions: user.permissions || [],
      },
    });
  } catch (error: any) {
    console.error("Register error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user (يسمح للجميع بالدخول إذا البيانات صحيحة)
// @access  Public
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, email, password, centerId } = req.body as any;

    // identifier ممكن يجي username أو email أو حتى حقل username يحمل ايميل
    const identifier = String(username || email || "").trim();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username/email and password",
      });
    }

    // Find user by username OR email
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }],
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    // ✅ Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // ✅ تحقق المركز فقط للـ employee (ويكون مطلوب)
    if (user.role === "employee") {
      const userCenter = user.center ? user.center.toString() : null;

      if (!centerId) {
        return res.status(400).json({
          success: false,
          message: "centerId is required for employee login",
        });
      }

      if (!userCenter || userCenter !== String(centerId)) {
        return res.status(401).json({
          success: false,
          message: "هذا الحساب غير تابع لهذا المركز",
        });
      }
    }

    // سجل IP بعد نجاح الدخول
    const ip = getClientIp(req);
    await User.updateOne(
      { _id: user._id },
      { $set: { lastLoginIp: ip, lastLoginAt: new Date() } }
    );

    // رجّع بيانات المركز للفرونت (إذا موجود)
    await user.populate("center", "name code ip province");

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        employeeId: user.employeeId,
        permissions: user.permissions || [],
        center: user.center || null,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get("/me", protect, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user.id).populate("center", "name code ip province");

    return res.status(200).json({
      success: true,
      user: {
        id: user?._id,
        username: user?.username,
        email: user?.email,
        fullName: user?.fullName,
        role: user?.role,
        employeeId: user?.employeeId,
        permissions: user?.permissions || [],
        center: (user as any)?.center || null,
      },
    });
  } catch (error: any) {
    console.error("Get me error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

export default router;
