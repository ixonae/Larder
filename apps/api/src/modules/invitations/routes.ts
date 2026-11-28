import { acceptInvitationSchema, registerByInvitationSchema } from "@larder/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { limitCredentials, sessionCookie, writeSessionCookie } from "../../auth/middleware.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import { acceptInvitation, previewInvitation, registerByInvitation } from "./service.ts";

/** Reachable without a session: looking at an invitation and creating an account from it. */
// biome-ignore lint/nursery/useExplicitType: Hono infers the public RPC schema from the chained routes.
export const publicInvitationRoutes = (publicBody: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .post("/preview", publicBody, validate("json", acceptInvitationSchema), (c) =>
      c.json(previewInvitation(c.var.db, c.req.valid("json").token)),
    )
    .post(
      "/register",
      publicBody,
      validate("json", registerByInvitationSchema),
      limitCredentials,
      async (c) => {
        const { bar, session } = await registerByInvitation(
          c.var.db,
          c.req.valid("json"),
          sessionCookie(c),
        );
        writeSessionCookie(c, session);
        return c.json(bar, 201);
      },
    );

export const invitationRoutes = new Hono<AppEnv>().post(
  "/accept",
  validate("json", acceptInvitationSchema),
  (c) => c.json(acceptInvitation(c.var.db, c.req.valid("json").token, c.var.user.id)),
);
