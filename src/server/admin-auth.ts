import type { NextApiRequest, NextApiResponse } from "next";

import { combinedAuth } from "~/server/auth";
import { db } from "~/server/db";

export const requireAdmin = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const session = await combinedAuth(req, res);

  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  if ("error" in session) {
    res.status(401).json({ error: session.error });
    return null;
  }

  const userId = session.user.id;
  if (!userId) {
    res.status(401).json({ error: "Invalid session" });
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, isActive: true },
  });

  if (!user?.isActive || !user.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return { session, user };
};
