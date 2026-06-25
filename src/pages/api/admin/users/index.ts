import type { NextApiRequest, NextApiResponse } from "next";
import argon2 from "argon2";

import { requireAdmin } from "~/server/admin-auth";
import { db } from "~/server/db";

const normalizeUsername = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const users = await db.user.findMany({
      orderBy: [{ isAdmin: "desc" }, { createdAt: "asc" }],
      select: userSelect,
    });
    res.status(200).json({ users });
    return;
  }

  if (req.method === "POST") {
    const username = normalizeUsername(req.body?.username);
    const email =
      normalizeEmail(req.body?.email) ?? `${username}@local.tensara`;
    const name = normalizeUsername(req.body?.name) || username;
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const isAdmin = req.body?.isAdmin === true;
    const isActive = req.body?.isActive !== false;
    const canUseProfiler = req.body?.canUseProfiler === true;

    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      res.status(400).json({
        error:
          "Username must be 3-32 characters using letters, numbers, _ or -",
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const existing = await db.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
      select: { id: true },
    });

    if (existing) {
      res
        .status(409)
        .json({ error: "A user with that username or email exists" });
      return;
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await db.user.create({
      data: {
        username,
        name,
        email,
        passwordHash,
        isAdmin,
        isActive,
        canUseProfiler,
      },
      select: userSelect,
    });

    res.status(201).json({ user });
    return;
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
