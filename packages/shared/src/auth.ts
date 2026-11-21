import { z } from "zod";

export const accountEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const displayNameSchema = z.string().trim().min(1).max(80);
export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 256;

export const signInSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type SignIn = z.output<typeof signInSchema>;

export const newAccountSchema = signInSchema.extend({
  display_name: displayNameSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export const SESSION_REQUEST_HEADER = "X-Larder-Request";

export type NewAccount = z.output<typeof newAccountSchema>;

const currentPasswordSchema: (typeof signInSchema.shape)["password"] = signInSchema.pick({
  password: true,
}).shape.password;
export const changeEmailSchema = z.object({
  current_password: currentPasswordSchema,
  email: accountEmailSchema,
});
export type ChangeEmail = z.output<typeof changeEmailSchema>;

export const resetUserPasswordSchema = z
  .object({
    new_password: newAccountSchema.shape.password,
    confirm_password: z.string(),
  })
  .refine(({ new_password, confirm_password }) => new_password === confirm_password, {
    path: ["confirm_password"],
    message: "Passwords must match.",
  });
export type ResetUserPassword = z.output<typeof resetUserPasswordSchema>;

export const changePasswordSchema = resetUserPasswordSchema.safeExtend({
  current_password: currentPasswordSchema,
});
export type ChangePassword = z.output<typeof changePasswordSchema>;

export const SIGNUP_MODES = ["invite_only", "open", "closed"] as const;
export const signupModeSchema = z.enum(SIGNUP_MODES);
export const signupSettingsSchema = z.object({ signup_mode: signupModeSchema });
export type SignupSettings = z.output<typeof signupSettingsSchema>;
