const UNLIMITED_SUBMISSIONS = 999_999;

export async function checkRateLimit(userId: string) {
  if (!userId) {
    return {
      allowed: false,
      error: "Not authenticated",
      statusCode: 401,
    };
  }

  return {
    allowed: true,
    remainingSubmissions: UNLIMITED_SUBMISSIONS,
  };
}
