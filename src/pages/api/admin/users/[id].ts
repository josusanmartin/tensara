import type { NextApiRequest, NextApiResponse } from "next";
import argon2 from "argon2";

import { requireAdmin } from "~/server/admin-auth";
import { db } from "~/server/db";

const userSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  isAdmin: true,
  isActive: true,
  canUseProfiler: true,
  createdAt: true,
  lastLogin: true,
  _count: {
    select: {
      submissions: true,
      ApiKey: true,
    },
  },
};

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : undefined;

const normalizeEmail = (value: unknown) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const remainingAdminsAfterChange = async (
  userId: string,
  willBeAdmin: boolean
) => {
  if (willBeAdmin) return 1;

  return db.user.count({
    where: {
      isAdmin: true,
      id: { not: userId },
    },
  });
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    res.status(400).json({ error: "Missing user id" });
    return;
  }

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true },
  });
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.method === "PATCH") {
    const data: {
      username?: string;
      name?: string | null;
      email?: string | null;
      isAdmin?: boolean;
      isActive?: boolean;
      canUseProfiler?: boolean;
      passwordHash?: string;
    } = {};

    if ("username" in req.body) {
      const username = normalizeString(req.body.username);
      if (!username || !/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        res.status(400).json({
          error:
            "Username must be 3-32 characters using letters, numbers, _ or -",
        });
        return;
      }
      data.username = username;
    }

    if ("name" in req.body) {
      data.name = normalizeString(req.body.name) ?? null;
    }

    if ("email" in req.body) {
      data.email = normalizeEmail(req.body.email);
    }

    if ("isAdmin" in req.body) {
      const isAdmin = req.body.isAdmin === true;
      const remainingAdmins = await remainingAdminsAfterChange(id, isAdmin);
      if (remainingAdmins < 1) {
        res
          .status(400)
          .json({ error: "At least one admin account is required" });
        return;
      }
      data.isAdmin = isAdmin;
    }

    if ("isActive" in req.body) {
      const isActive = req.body.isActive === true;
      if (!isActive && admin.user.id === id) {
        res.status(400).json({ error: "You cannot disable your own account" });
        return;
      }
      data.isActive = isActive;
    }

    if ("canUseProfiler" in req.body) {
      data.canUseProfiler = req.body.canUseProfiler === true;
    }

    if ("password" in req.body) {
      const password =
        typeof req.body.password === "string" ? req.body.password : "";
      if (password.length < 8) {
        res
          .status(400)
          .json({ error: "Password must be at least 8 characters" });
        return;
      }
      data.passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
    }

    try {
      const user = await db.user.update({
        where: { id },
        data,
        select: userSelect,
      });
      res.status(200).json({ user });
    } catch {
      res.status(409).json({ error: "Username or email is already in use" });
    }
    return;
  }

  if (req.method === "DELETE") {
    if (admin.user.id === id) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const adminCount = await db.user.count({ where: { isAdmin: true } });
    if (target.isAdmin && adminCount <= 1) {
      res.status(400).json({ error: "At least one admin account is required" });
      return;
    }

    await db.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });
    res.status(204).end();
    return;
  }

  res.setHeader("Allow", ["PATCH", "DELETE"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
