import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { onUnauthorized } from "@/api/query-client.ts";

interface CredentialSubmission<T> {
  submit: (data: T) => Promise<void>;
  error: Error | null;
  isPending: boolean;
  isSuccess: boolean;
}

/** Only submission status lives in React state. Passwords never enter a query or mutation cache. */
export function useCredentialSubmit<T>(
  request: (data: T) => Promise<unknown>,
): CredentialSubmission<T> {
  const client = useQueryClient();
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [error, setError] = useState<Error | null>(null);
  return {
    error,
    isPending: status === "pending",
    isSuccess: status === "success",
    submit: async (data: T) => {
      setStatus("pending");
      setError(null);
      try {
        await request(data);
        setStatus("success");
      } catch (cause) {
        onUnauthorized(client, cause);
        setError(cause instanceof Error ? cause : new Error("Request failed"));
        setStatus("idle");
      }
    },
  };
}
