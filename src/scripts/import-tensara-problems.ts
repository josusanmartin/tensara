import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_BASE_URL =
  process.env.TENSARA_PROBLEMS_SOURCE_URL ?? "https://tensara.org";

type TrpcResponse<T> = Array<{
  result?: {
    data?: {
      json?: T;
    };
  };
  error?: {
    message?: string;
  };
}>;

type ProblemSummary = {
  slug: string;
};

type ProblemDetail = {
  slug: string;
  title: string;
  description?: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  author: string;
  parameters?: unknown;
  tags?: string[];
  gpus?: string[];
  baselineBenchmarks?: unknown;
  definition?: string | null;
  referenceSolution?: string | null;
  getFlops?: string | null;
};

const trpcUrl = (procedure: string, input: unknown) => {
  const encodedInput = encodeURIComponent(
    JSON.stringify({ 0: { json: input } })
  );
  return `${SOURCE_BASE_URL}/api/trpc/${procedure}?batch=1&input=${encodedInput}`;
};

async function fetchTrpc<T>(procedure: string, input: unknown): Promise<T> {
  const response = await fetch(trpcUrl(procedure, input), {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `${procedure} returned ${response.status}: ${await response.text()}`
    );
  }

  const payload = (await response.json()) as TrpcResponse<T>;
  const first = payload[0];
  if (first?.error) {
    throw new Error(first.error.message ?? `${procedure} failed`);
  }

  const data = first?.result?.data?.json;
  if (data == null) {
    throw new Error(`${procedure} returned no data`);
  }

  return data;
}

async function main() {
  const summaries = await fetchTrpc<ProblemSummary[]>("problems.getAll", null);
  const slugs = [...new Set(summaries.map((problem) => problem.slug))].sort();

  console.log(`Found ${slugs.length} upstream Tensara problems`);

  let imported = 0;
  for (const slug of slugs) {
    const problem = await fetchTrpc<ProblemDetail>("problems.getById", {
      slug,
    });

    await prisma.problem.upsert({
      where: { slug: problem.slug },
      update: {
        title: problem.title,
        description: problem.description ?? null,
        difficulty: problem.difficulty,
        author: problem.author,
        parameters: (problem.parameters ?? []) as Prisma.InputJsonValue,
        tags: problem.tags ?? [],
        gpus: problem.gpus ?? [],
        baselineBenchmarks: (problem.baselineBenchmarks ??
          {}) as Prisma.InputJsonValue,
        definition: problem.definition ?? null,
        referenceSolution: problem.referenceSolution ?? null,
        getFlops: problem.getFlops ?? null,
      },
      create: {
        slug: problem.slug,
        title: problem.title,
        description: problem.description ?? null,
        difficulty: problem.difficulty,
        author: problem.author,
        parameters: (problem.parameters ?? []) as Prisma.InputJsonValue,
        tags: problem.tags ?? [],
        gpus: problem.gpus ?? [],
        baselineBenchmarks: (problem.baselineBenchmarks ??
          {}) as Prisma.InputJsonValue,
        definition: problem.definition ?? null,
        referenceSolution: problem.referenceSolution ?? null,
        getFlops: problem.getFlops ?? null,
      },
    });

    imported += 1;
    console.log(`[${imported}/${slugs.length}] Upserted ${problem.slug}`);
  }

  const total = await prisma.problem.count();
  console.log(`Done. Local problem count: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
