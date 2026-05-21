import {
  NOT_ADMIN_ERR_MSG,
  NOT_FEATURE_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { API_FEATURE_BY_ROUTER } from "@shared/rbac";
import type { FeatureKey } from "@shared/rbac";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { userHasFeature } from "./rbac";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const requireFeature = t.middleware(async (opts) => {
  const { ctx, next, path } = opts;

  const root = path.split(".")[0] ?? "";
  const feature = API_FEATURE_BY_ROUTER[root] as FeatureKey | undefined;

  if (feature && ctx.user) {
    const allowed = await userHasFeature(ctx.user.role, feature, ctx.user.id);
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_FEATURE_ERR_MSG });
    }
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser).use(requireFeature);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);

/** Procedure that requires a specific feature (for mixed routers). */
export function featureProcedure(feature: FeatureKey) {
  return t.procedure.use(requireUser).use(
    t.middleware(async (opts) => {
      const { ctx, next } = opts;
      const allowed = await userHasFeature(ctx.user!.role, feature, ctx.user!.id);
      if (!allowed) {
        throw new TRPCError({ code: "FORBIDDEN", message: NOT_FEATURE_ERR_MSG });
      }
      return next({ ctx: { ...ctx, user: ctx.user! } });
    })
  );
}
