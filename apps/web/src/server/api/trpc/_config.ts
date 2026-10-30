import { logError } from "@streambrew/packages/server-logger.js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { SuperJSON } from "superjson";

import { getViewer } from "../_util.js";

export const createContext = async (opt: FetchCreateContextFnOptions) => {
  const viewer = await getViewer(opt.req);
  return { request: opt.req, userId: viewer?.userId ?? null, viewer };
};

type Context = Omit<Awaited<ReturnType<typeof createContext>>, "viewer"> & {
  viewer?: Awaited<ReturnType<typeof createContext>>["viewer"];
};

const t = initTRPC.context<Context>().create({
  transformer: SuperJSON,
  errorFormatter({ shape, error }) {
    // Client errors are part of the API contract; only server failures are operational events.
    if (shape.data.httpStatus < 500) return shape;
    logError("tRPC request failed", error, { code: error.code, path: shape.data.path });
    // Unexpected failures, such as database errors, must not expose their details to the browser.
    return { ...shape, message: "Internal server error." };
  },
});

export const router = t.router;
export const procedure = t.procedure;

export const authenticatedProcedure = procedure.use(async ({ next, ctx }) => {
  const userId = ctx.userId;

  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx: { ...ctx, userId } });
});

export const adminProcedure = authenticatedProcedure.use(async ({ next, ctx }) => {
  if (!ctx.viewer?.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
