import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import argon2 from "argon2";

import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      username?: string;
      isAdmin?: boolean;
      isActive?: boolean;
      canUseProfiler?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string;
    isAdmin?: boolean;
    isActive?: boolean;
    canUseProfiler?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    isAdmin?: boolean;
    isActive?: boolean;
    canUseProfiler?: boolean;
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Username and password",
      credentials: {
        username: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;

        if (!username || !password) {
          return null;
        }

        const user = await db.user.findFirst({
          where: {
            OR: [{ username }, { email: username }],
          },
        });

        if (!user?.passwordHash || !user.isActive) {
          return null;
        }

        const isValid = await argon2.verify(user.passwordHash, password);
        if (!isValid) {
          return null;
        }

        await db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          username: user.username ?? undefined,
          isAdmin: user.isAdmin,
          isActive: user.isActive,
          canUseProfiler: user.canUseProfiler,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        token.username = user.username;
        token.isAdmin = user.isAdmin;
        token.isActive = user.isActive;
        token.canUseProfiler = user.canUseProfiler;
      } else if (token.sub) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          select: {
            username: true,
            canUseProfiler: true,
            isAdmin: true,
            isActive: true,
          },
        });
        token.username = dbUser?.username ?? token.username;
        token.canUseProfiler = dbUser?.canUseProfiler ?? false;
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.isActive = dbUser?.isActive ?? false;
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub ?? "",
        username: token.username,
        isAdmin: token.isAdmin,
        isActive: token.isActive,
        canUseProfiler: token.canUseProfiler,
      },
    }),
  },
} satisfies NextAuthOptions;

interface DiscordProfile {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email: string | null;
}

export const discordAuth = (
  config: OAuthUserConfig<DiscordProfile>
): OAuthConfig<DiscordProfile> => ({
  id: "discord",
  name: "Discord",
  type: "oauth",
  authorization:
    "https://discord.com/api/oauth2/authorize?scope=identify+email",
  token: "https://discord.com/api/oauth2/token",
  userinfo: "https://discord.com/api/users/@me",
  profile(profile) {
    return {
      id: profile.id,
      name: profile.username,
      email: profile.email,
      image: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null,
    };
  },
  ...config,
});
