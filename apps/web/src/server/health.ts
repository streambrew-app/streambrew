const databaseTimeoutMs = 2_000;

/**
 * Answers the health check. The web process is healthy only while PostgreSQL responds
 * within the time budget, which stays below the 3-second container health check timeout.
 */
export async function healthResponse(
  pingDatabase: () => PromiseLike<unknown>,
  timeoutMs = databaseTimeoutMs,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, false);
  });
  // Cancelling a fast query can race with other queries; a late answer is ignored instead.
  const answered = Promise.resolve(pingDatabase()).then(
    () => true,
    () => false,
  );
  try {
    return (await Promise.race([answered, timedOut]))
      ? new Response("ok")
      : new Response("database unavailable", { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
