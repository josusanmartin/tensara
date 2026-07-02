import type { NextApiRequest, NextApiResponse } from "next";
import argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "~/server/db";

type RegisterResponse =
  | {
      user: {
        id: string;
        username: string | null;
        email: string | null;
      };
    }
  | { error: string };

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(
        /^[a-zA-Z0-9_-]{3,32}$/,
        "Username must be 3-32 characters using letters, numbers, _ or -"
      ),
    password: z.string().min(8, "Password must be at least 8 characters"),
    verifyPassword: z.string(),
    email: z.preprocess((value) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().email("Enter a valid email address").optional()),
  })
  .refine((value) => value.password === value.verifyPassword, {
    path: ["verifyPassword"],
    message: "Passwords do not match",
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegisterResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid registration details",
    });
    return;
  }

  const { username, password, email } = parsed.data;

  const conflicts = await db.user.findMany({
    where: {
      OR: [{ username }, ...(email ? [{ email }] : [])],
    },
    select: { username: true, email: true },
    take: 2,
  });

  if (conflicts.some((user) => user.username === username)) {
    res.status(409).json({ error: "That username is already in use" });
    return;
  }

  if (email && conflicts.some((user) => user.email === email)) {
    res.status(409).json({ error: "That email is already in use" });
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  try {
    const user = await db.user.create({
      data: {
        username,
        name: username,
        email: email ?? null,
        passwordHash,
        isActive: true,
        canUseProfiler: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    res.status(201).json({ user });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : String(error.meta?.target ?? "");
      const field = target.includes("email") ? "email" : "username";
      res.status(409).json({ error: `That ${field} is already in use` });
      return;
    }

    throw error;
  }
}
