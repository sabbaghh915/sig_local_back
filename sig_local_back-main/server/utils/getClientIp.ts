import type { Request } from "express";

export function getClientIp(req: Request): string {
  const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  const xrip = req.headers["x-real-ip"] as string | undefined;

  return xff || xrip || req.socket.remoteAddress || "unknown";
}
