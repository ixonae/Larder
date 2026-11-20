import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
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
import { Label } from "@/components/ui/label.tsx";

/** `useForm` validated by a shared Zod schema: the same rules as the API, checked before sending. */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  props: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, "resolver"> = {},
) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    // The resolver is typed loosely for generic schemas; its output is the schema's output.
    resolver: zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    mode: "onTouched",
    ...props,
  });
}

// biome-ignore lint/suspicious/noExplicitAny: forms of any schema; only field state is read.
type AnyForm<T extends FieldValues> = UseFormReturn<T, any, any>;

interface Issue {
  path: PropertyKey[];
  message: string;
}

const isIssueList = (details: unknown): details is Issue[] =>
  Array.isArray(details) &&
  details.every(
    (d) =>
      typeof d === "object" && d !== null && Array.isArray(d.path) && typeof d.message === "string",
  );

/** `setValueAs` for optional number inputs. */
export const emptyToNullNumber = (v: unknown) => (v === "" || v === null ? null : Number(v));

/**
 * Puts the API's field issues (from `VALIDATION`, or a `CONFLICT` such as a duplicate name) on the
 * matching fields. Returns false when nothing could be
 * attached to a field, so the caller can show the error another way (a toast).
 */
export function applyServerErrors<T extends FieldValues>(
  form: AnyForm<T>,
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
  form: AnyForm<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  /** Keep the label for screen readers only, where the layout already says what the field is. */
  srOnlyLabel?: boolean;
  children: (control: ControlProps) => ReactNode;
}>) {
  const id = `field-${name}`;
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

type ComboboxFieldProps<T extends FieldValues> = {
  form: AnyForm<T>;
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
export function ComboboxField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  toValue = (value) => value,
  ...combobox
}: ComboboxFieldProps<T>) {
  return (
    <FormField form={form} name={name} label={label} hint={hint}>
      {(control) => (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <Combobox
              {...control}
              {...combobox}
              ref={field.ref}
              value={field.value}
              disabled={field.disabled}
              onBlur={field.onBlur}
              onChange={(value) => field.onChange(toValue(value))}
            />
          )}
        />
      )}
    </FormField>
  );
}
