/**
 * Error helpers. `AppError` carries an HTTP status and a message that is safe
 * to show the user. `describeProviderError` turns the many shapes of NVIDIA
 * failures (bad key, rate limit, unknown model...) into one clear sentence.
 * (Adapted from Company Knowledge AI.)
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export function isAbortError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | undefined;
  return e?.name === "AbortError" || e?.name === "APIUserAbortError" || /aborted/i.test(e?.message ?? "");
}

/** Removes anything that looks like a key or token before text is logged or returned. */
export function redact(text: string): string {
  return text
    .replace(/(nvapi-|sk-|AIza)[A-Za-z0-9_\-]{8,}/g, "$1***")
    .replace(/\b[A-Za-z0-9]{32,}\b/g, "***") // long bare keys (DeepInfra keys have no prefix)
    .replace(/(Bearer\s+)[A-Za-z0-9_\-.]+/gi, "$1***")
    .replace(/(key=)[A-Za-z0-9_\-]+/gi, "$1***");
}

export function describeProviderError(label: string, model: string, err: unknown, keyName = "NVIDIA_API_KEY"): AppError {
  if (err instanceof AppError) return err;
  const e = err as { status?: number; code?: string | number; message?: string; cause?: { code?: string } };
  const status = typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
  const detail = redact(String(e?.message ?? err)).slice(0, 300);

  if (status === 401 || status === 403 || /api key not valid|invalid api key|unauthorized/i.test(detail))
    return new AppError(502, `${label} rejected the API key. Check ${keyName} in ai-server/.env.`, "invalid_api_key");
  if (status === 410 || /end of life|end-of-life|deprecated|retired|no longer (available|supported|served)/i.test(detail))
    return new AppError(502, `${label}: the model "${model}" has been retired by the provider. Put a current model in NVIDIA_MODEL in ai-server/.env (e.g. nvidia/nemotron-3.5-super-vl-120b-a12b) and restart.`, "unsupported_model");
  if (status === 404 || /model.*not (found|exist)|unknown model/i.test(detail))
    return new AppError(502, `${label} does not recognise the model "${model}", or it is not enabled for your account. Update the model ID in ai-server/.env.`, "unsupported_model");
  // NVIDIA screens every input; some textbook passages (e.g. on reproduction,
  // drugs, war) or garbled PDF text can trip that filter. Not retryable.
  if (/content safety|safety screening|input rejected/i.test(detail))
    return new AppError(422, `${label} refused this text: it was flagged by NVIDIA's content safety screening.`, "content_rejected");
  if (status === 429)
    return new AppError(429, `${label} rate limit or quota reached. Wait a moment and try again.`, "rate_limited");
  if (status === 402)
    return new AppError(502, `${label} reports insufficient credit on the account.`, "insufficient_balance");
  if (status && status >= 500)
    return new AppError(502, `${label} is having a service problem (HTTP ${status}). Try again shortly.`, "provider_unavailable");
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|Connection error/i.test(detail + (e?.cause?.code ?? "")))
    return new AppError(502, `Could not reach ${label}. Check the internet connection.`, "network_error");
  return new AppError(502, `${label} request failed: ${detail}`, "provider_error");
}

/** Logs a technical error without leaking keys or sign-in tokens. */
export function logError(context: string, err: unknown): void {
  const e = err as { status?: number; message?: string };
  console.error(`[${context}]`, e?.status ?? "", redact(String(e?.message ?? err)));
}
