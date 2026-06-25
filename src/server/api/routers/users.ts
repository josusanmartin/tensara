import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { LANGUAGE_PROFILE_DISPLAY_NAMES } from "~/constants/language";

export const usersRouter = createTRPCRouter({
  getByUsername: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: { username: { equals: input.username, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          createdAt: true,
          rating: true,
          rank: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const [
        submissionsCount,
        solvedProblems,
        solvedProblemsWithLanguage,
        recentSubmissions,
        submissionDates,
        blogPosts,
        totalCommunityPosts,
        totalCommunityLikes,
      ] = await Promise.all([
        ctx.db.submission.count({
          where: { userId: user.id },
        }),
        ctx.db.problem.count({
          where: {
            submissions: {
              some: {
                userId: user.id,
                status: "ACCEPTED",
                moderationStatus: null,
              },
            },
          },
        }),
        ctx.db.submission.groupBy({
          by: ["language"],
          _count: {
            id: true,
          },
          where: {
            userId: user.id,
            status: "ACCEPTED",
            moderationStatus: null,
          },
        }),
        ctx.db.submission.findMany({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
            createdAt: true,
            status: true,
            moderationStatus: true,
            runtime: true,
            gflops: true,
            gpuType: true,
            problem: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
            language: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        ctx.db.submission.groupBy({
          by: ["createdAt"],
          where: {
            userId: user.id,
          },
          _count: {
            id: true,
          },
        }),
        ctx.db.blogPost.findMany({
          where: {
            authorId: user.id,
            status: "PUBLISHED",
          },
          select: {
            id: true,
            title: true,
            slug: true,
            publishedAt: true,
            createdAt: true,
            _count: {
              select: {
                upvotes: true,
              },
            },
          },
          orderBy: {
            publishedAt: "desc",
          },
          take: 5,
        }),
        ctx.db.blogPost.count({
          where: {
            authorId: user.id,
            status: "PUBLISHED",
          },
        }),
        ctx.db.postUpvote.count({
          where: {
            post: {
              authorId: user.id,
            },
          },
        }),
      ]);

      const totalSolvedProblems = solvedProblemsWithLanguage.reduce(
        (acc, curr) => acc + curr._count.id,
        0
      );
      const languagePercentage = solvedProblemsWithLanguage.map((language) => {
        return {
          language: LANGUAGE_PROFILE_DISPLAY_NAMES[language.language],
          percentage: Number(
            ((language._count.id / totalSolvedProblems) * 100).toFixed(2)
          ),
        };
      });

      // Format the dates for the activity calendar
      const activityData = submissionDates.map((day) => {
        // Format date to YYYY-MM-DD
        const date = new Date(day.createdAt);
        const formattedDate = date.toISOString().split("T")[0];

        return {
          date: formattedDate,
          count: day._count.id,
        };
      });

      return {
        id: user.id,
        username: user.username,
        name: user.name,
        image: user.image,
        joinedAt: user.createdAt.toISOString(),
        stats: {
          submissions: submissionsCount,
          solvedProblems,
          ranking: user.rank ?? 9999,
          rating: user.rating ?? 0,
        },
        recentSubmissions: recentSubmissions.map((sub) => ({
          id: sub.id,
          problemId: sub.problem.slug,
          problemName: sub.problem.title,
          date: sub.createdAt.toISOString().split("T")[0],
          status: (sub.status ?? "pending").toLowerCase(),
          runtime: sub.runtime ? `${sub.runtime.toFixed(2)}ms` : "N/A",
          gflops: sub.gflops ? `${sub.gflops.toFixed(2)}` : "N/A",
          gpuType: sub.gpuType,
          language: sub.language,
          moderationStatus: sub.moderationStatus,
        })),
        blogPosts: blogPosts.map((post) => ({
          id: post.id,
          title: post.title,
          slug: post.slug,
          publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
          votes: post._count.upvotes ?? 0,
        })),
        communityStats: {
          totalPosts: totalCommunityPosts,
          totalLikes: totalCommunityLikes,
        },
        activityData,
        languagePercentage,
      };
    }),
  getTopRankedPlayers: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get users ordered by rating who have solved at least one problem
      const users = await ctx.db.user.findMany({
        where: {
          submissions: {
            some: {
              status: "ACCEPTED",
              moderationStatus: null,
            },
          },
          rating: {
            not: 0 || null,
          },
        },
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          rating: true,
          rank: true,
          _count: {
            select: {
              submissions: {
                where: {
                  status: "ACCEPTED",
                  moderationStatus: null,
                },
              },
            },
          },
        },
        orderBy: { rating: "desc" },
        take: input.limit,
      });

      // For each user, get their solved problems count and best submission
      const enhancedUsers = await Promise.all(
        users.map(async (user) => {
          const solvedProblemsCount = await ctx.db.problem.count({
            where: {
              submissions: {
                some: {
                  userId: user.id,
                  status: "ACCEPTED",
                  moderationStatus: null,
                },
              },
            },
          });

          const bestSubmission = await ctx.db.submission.findFirst({
            where: {
              userId: user.id,
              runtime: { not: null },
              status: "ACCEPTED",
              moderationStatus: null,
            },
            orderBy: {
              runtime: "asc",
            },
            select: {
              id: true,
              runtime: true,
              gflops: true,
              gpuType: true,
              problem: {
                select: {
                  title: true,
                  slug: true,
                },
              },
            },
          });

          // Only include users who have a best submission
          if (!bestSubmission) return null;

          return {
            id: user.id,
            username: user.username ?? "",
            name: user.name ?? "",
            image: user.image ?? "",
            rating: user.rating ?? 0,
            rank: user.rank ?? 9999,
            submissionsCount: user._count.submissions,
            solvedProblemsCount,
            bestSubmission,
          };
        })
      );

      // Filter out null values and return only users with best submissions
      return enhancedUsers.filter(
        (user): user is NonNullable<typeof user> => user !== null
      );
    }),
});
