import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    next();
  };
};

export const requirePermission = (...perms: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (role === "admin") return next(); // ✅ admin يتجاوز كل شيء

    const userPerms: string[] = req.user?.permissions || [];
    const ok = perms.every((p) => userPerms.includes(p));
    if (!ok) return res.status(403).json({ success: false, message: "Missing permission" });
    next();
  };
};
