import { zodResolver } from "@hookform/resolvers/zod";
import { MIN_PASSWORD_LENGTH } from "@larder/shared";
import type { JSX } from "react";
import { type ReactNode, useId } from "react";
import type { ControllerRenderProps } from "react-hook-form";
import {
  Controller,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
  useForm,
} from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "@/api/client.ts";
import { Combobox, type ComboboxProps } from "@/components/combobox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

/** `useForm` validated by a shared Zod schema: the same rules as the API, checked before sending. */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  props: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, "resolver"> = {},
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({
    // The resolver is typed loosely for generic schemas; its output is the schema's output.
    resolver: zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    mode: "onTouched",
    ...props,
  });
}

type FormFieldState<T extends FieldValues> = Pick<UseFormReturn<T>, "getFieldState" | "formState">;

interface Issue {
  path: PropertyKey[];
  message: string;
}

const isIssueList = (details: unknown): details is Issue[] =>
  Array.isArray(details) &&
  details.every((value: unknown): boolean => {
    const issue = value as { path?: unknown; message?: unknown } | null;
    return (
      typeof issue === "object" &&
      issue !== null &&
      Array.isArray(issue.path) &&
      typeof issue.message === "string"
    );
  });

/** `setValueAs` for optional number inputs. */
export const emptyToNullNumber = (v: unknown): number | null =>
  v === "" || v === null ? null : Number(v);

/**
 * Puts the API's field issues (from `VALIDATION`, or a `CONFLICT` such as a duplicate name) on the
 * matching fields. Returns false when nothing could be
 * attached to a field, so the caller can show the error another way (a toast).
 */
export function applyServerErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, "setError">,
  error: unknown,
): boolean {
  if (
    !(error instanceof ApiError) ||
    !["VALIDATION", "CONFLICT"].includes(error.code) ||
    !isIssueList(error.details)
  ) {
    return false;
  }
  let applied = false;
  for (const issue of error.details) {
    if (issue.path.length === 0) continue;
    form.setError(issue.path.join(".") as Path<T>, { type: "server", message: issue.message });
    applied = true;
  }
  return applied;
}

export interface ControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

/** A labelled form row: the label, the control (from `children`), an optional hint and the field error. */
export function FormField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  srOnlyLabel = false,
  children,
}: Readonly<{
  form: FormFieldState<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  /** Keep the label for screen readers only, where the layout already says what the field is. */
  srOnlyLabel?: boolean;
  children: (control: ControlProps) => ReactNode;
}>): JSX.Element {
  const id = useId();
  const { error } = form.getFieldState(name, form.formState);
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={srOnlyLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy || undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error.message}
        </p>
      )}
    </div>
  );
}

/** A password row; `lengthHint` adds the minimum length under a field that sets a new password. */
export function PasswordField<T extends FieldValues>({
  form,
  name,
  label,
  autoComplete,
  lengthHint = false,
}: Readonly<{
  form: FormFieldState<T> & Pick<UseFormReturn<T>, "register">;
  name: Path<T>;
  label: string;
  autoComplete: "current-password" | "new-password";
  lengthHint?: boolean;
}>): JSX.Element {
  return (
    <FormField
      form={form}
      name={name}
      label={label}
      hint={lengthHint ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
    >
      {(control: ControlProps): JSX.Element => (
        <Input {...control} {...form.register(name)} type="password" autoComplete={autoComplete} />
      )}
    </FormField>
  );
}

/** The error of a failed request, announced to screen readers. */
export function FormError({
  error,
}: Readonly<{ error: Error | null | undefined }>): JSX.Element | null {
  if (!error) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {error.message}
    </p>
  );
}

type ComboboxFieldProps<T extends FieldValues, TOutput extends FieldValues> = {
  form: FormFieldState<T> & Pick<UseFormReturn<T, unknown, TOutput>, "control">;
  name: Path<T>;
  label: string;
  hint?: string;
  /** What to store for a choice; for example `(value) => value || null` to store a cleared one as null. */
  toValue?: (value: string) => unknown;
} & Omit<
  ComboboxProps,
  "id" | "value" | "onChange" | "onBlur" | "ref" | "aria-invalid" | "aria-describedby"
>;

/** A labelled `Combobox` bound to a form field. */
export function ComboboxField<T extends FieldValues, TOutput extends FieldValues>({
  form,
  name,
  label,
  hint,
  toValue = (value: string): string => value,
  ...combobox
}: ComboboxFieldProps<T, TOutput>): JSX.Element {
  return (
    <FormField form={form} name={name} label={label} hint={hint}>
      {(control: ControlProps): JSX.Element => (
        <Controller
          control={form.control}
          name={name}
          render={({ field }: { field: ControllerRenderProps<T, Path<T>> }): JSX.Element => (
            <Combobox
              {...control}
              {...combobox}
              ref={field.ref}
              value={field.value}
              disabled={field.disabled}
              onBlur={field.onBlur}
              onChange={(value: string): void => field.onChange(toValue(value))}
            />
          )}
        />
      )}
    </FormField>
  );
}
