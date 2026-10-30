import { UserIdSchema } from "@streambrew/packages/schemas.js";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("@streambrew/packages/server-logger.js", () => ({ logError }));

import { adminProcedure, procedure, router } from "./_config.js";

const testRouter = router({
  adminOnly: adminProcedure.query(() => "allowed"),
  databaseFailure: procedure.query(() => {
    throw new Error('duplicate key value violates unique constraint "user_slug_key"');
  }),
  missing: procedure.query(() => {
    throw new TRPCError({ code: "NOT_FOUND", message: "Video not found." });
  }),
});

const userId = UserIdSchema.parse(42);
const user = { email: "admin@example.com", image: null, name: "Admin" };

afterEach(() => vi.resetAllMocks());

async function errorResponse(path: string) {
  const request = new Request(`http://localhost/trpc/${path}`);
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: testRouter,
    createContext: () => ({ request, userId: null }),
  });
  const body = (await response.json()) as {
    error: { json: { message: string; data: { code: string } } };
  };
  return { status: response.status, ...body.error.json };
}

describe("adminProcedure", () => {
  it("rejects an authenticated non-admin", async () => {
    const caller = testRouter.createCaller({
      request: new Request("http://localhost/trpc"),
      userId,
      viewer: { isAdmin: false, user, userId },
    });

    await expect(caller.adminOnly()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an administrator", async () => {
    const caller = testRouter.createCaller({
      request: new Request("http://localhost/trpc"),
      userId,
      viewer: { isAdmin: true, user, userId },
    });

    await expect(caller.adminOnly()).resolves.toBe("allowed");
  });
});

describe("error formatter", () => {
  it("hides and logs unexpected server failures", async () => {
    const error = await errorResponse("databaseFailure");

    expect(error).toMatchObject({
      status: 500,
      message: "Internal server error.",
      data: { code: "INTERNAL_SERVER_ERROR" },
    });
    expect(logError).toHaveBeenCalledWith(
      "tRPC request failed",
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { code: "INTERNAL_SERVER_ERROR", path: "databaseFailure" },
    );
  });

  it("returns expected client errors without logging them", async () => {
    await expect(errorResponse("missing")).resolves.toMatchObject({
      status: 404,
      message: "Video not found.",
      data: { code: "NOT_FOUND" },
    });
    expect(logError).not.toHaveBeenCalled();
  });
});
