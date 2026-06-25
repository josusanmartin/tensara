import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const username = process.env.LOCAL_AUTH_USERNAME ?? process.argv[2];
const password = process.env.LOCAL_AUTH_PASSWORD ?? process.argv[3];

async function main() {
  if (!username || !password) {
    throw new Error(
      "Usage: LOCAL_AUTH_USERNAME=<username> LOCAL_AUTH_PASSWORD=<password> pnpm seed:local-user"
    );
  }

  const email = process.env.LOCAL_AUTH_EMAIL ?? `${username}@local.tensara`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: username,
      username,
      passwordHash,
      isAdmin: true,
      isActive: true,
      canUseProfiler: true,
    },
    create: {
      name: username,
      username,
      email,
      passwordHash,
      isAdmin: true,
      isActive: true,
      canUseProfiler: true,
    },
  });

  console.log(`Local user ready: ${user.username ?? user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
