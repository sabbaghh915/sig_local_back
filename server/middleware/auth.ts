import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";

// Secret واحد فقط (ضعه في .env)
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-jwt-key-change-in-production-2024";

export interface AuthRequest extends Request {
  user?: any; // يفضل لاحقًا تكتب نوع User document
}

function getBearerToken(req: Request) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }

  // دعم شكلين للتوكن: {id} أو {sub}
  const userId = decoded?.id || decoded?.sub;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }

  const user = await User.findById(userId).select("-password -passwordHash");
  if (!user || user.isActive === false) {
    return res.status(401).json({ success: false, message: "User not found or inactive" });
  }

  req.user = user; // الآن req.user يحتوي role + centerId من الداتابيز
  next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized`,
      });
    }
    next();
  };
};

// ✅ Aliases حتى كودك القديم/الجديد يشتغل
export const requireAuth = protect;
export const allowRoles = (...roles: string[]) => authorize(...roles);


