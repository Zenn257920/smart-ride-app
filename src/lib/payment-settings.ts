/**
 * Pure helpers for the realistic manual top-up flow (Feature A,
 * 2026-11-23).
 *
 * This module has NO imports at runtime so it stays runnable in vitest
 * without a database. The API routes are thin wrappers around these
 * helpers — the rules below are the single source of truth for:
 *   - which providers are available for top-up (given the admin's
 *     payment_settings rows),
 *   - what a valid top-up submission looks like (amount, method,
 *     transaction ID, optional screenshot size),
 *   - what a valid receiving-account setting looks like.
 *
 * Money flows are NOT touched here — see src/lib/money.ts. A top-up
 * still only creates a PENDING ledger row; the balance moves only when
 * an admin confirms it.
 */

/** The two mobile-money providers the app accepts top-ups through. */
export const PAYMENT_PROVIDERS = ["KBZPay", "WavePay"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return (
    typeof value === "string" &&
    (PAYMENT_PROVIDERS as readonly string[]).includes(value)
  );
}

/** Minimum top-up amount (MMK) — same as the wallet page / topup route. */
export const MIN_TOPUP_AMOUNT = 1000;

/** Screenshot cap: ~1 MB of image bytes. Base64 inflates by 4/3, so
 * the base64 payload is capped just above 1 MB of chars. */
export const MAX_PROOF_IMAGE_BYTES = 1_048_576;
export const MAX_PROOF_IMAGE_BASE64_CHARS = 1_400_000;

/** Max length of a transaction ID as typed/pasted by the user. */
export const MAX_TRANSACTION_ID_LENGTH = 100;
/** Max lengths for the admin-configured receiving-account fields. */
export const MAX_ACCOUNT_NUMBER_LENGTH = 64;
export const MAX_ACCOUNT_NAME_LENGTH = 100;

/** One payment_settings row, as the routes return it. */
export interface PaymentSetting {
  id?: string;
  provider: string;
  accountNumber: string;
  accountName: string;
  enabled: boolean;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

/** The receiving account the top-up flow shows for one provider. */
export interface ReceivingAccount {
  provider: PaymentProvider;
  accountNumber: string;
  accountName: string;
}

/**
 * The receiving account for `provider`, or null when the admin has
 * not configured it or has disabled it. A missing/disabled row means
 * the provider is UNAVAILABLE in the top-up flow — never fall back to
 * a hardcoded account (none exists).
 */
export function findReceivingAccount(
  settings: PaymentSetting[],
  provider: string,
): ReceivingAccount | null {
  const row = settings.find((s) => s.provider === provider);
  if (!row || !row.enabled) return null;
  return {
    provider: provider as PaymentProvider,
    accountNumber: row.accountNumber,
    accountName: row.accountName,
  };
}

/** Providers the user can actually top up with right now. */
export function availableProviders(
  settings: PaymentSetting[],
): PaymentProvider[] {
  return PAYMENT_PROVIDERS.filter(
    (p) => findReceivingAccount(settings, p) !== null,
  );
}

/** Is `provider` available for top-up given the current settings? */
export function isProviderAvailable(
  settings: PaymentSetting[],
  provider: string,
): boolean {
  return findReceivingAccount(settings, provider) !== null;
}

// ---------------------------------------------------------------------------
// Top-up payload validation (POST /api/wallet/topup).
// ---------------------------------------------------------------------------

export interface TopupPayload {
  amount: number;
  method: PaymentProvider;
  phone?: string;
  /** Required: the transaction ID from the user's KBZPay/WavePay app. */
  transactionId: string;
  /** Optional receipt screenshot, as a data URL or raw base64. */
  proofImageBase64?: string | null;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Split a screenshot value into its base64 payload (stripping a
 * `data:image/...;base64,` prefix when present) and its MIME type.
 * Returns null when the value is not a plausible image payload.
 */
export function parseProofImage(
  value: string,
): { mimeType: string; base64: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dataUrl = trimmed.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (dataUrl) {
    return { mimeType: dataUrl[1], base64: dataUrl[2] };
  }
  // Raw base64 (no data-URL prefix): accept it, render as JPEG.
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return { mimeType: "image/jpeg", base64: trimmed };
  }
  return null;
}

/** Approximate decoded byte size of a base64 payload. */
export function base64ByteSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Validate a top-up submission. The transaction ID is REQUIRED — a
 * manual top-up with no reference cannot be matched to a real
 * transfer by the admin. The screenshot is optional but, when given,
 * must be an image and fit under the ~1MB cap.
 */
export function validateTopupPayload(
  input: unknown,
): ValidationResult<TopupPayload> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid top-up request." };
  }
  const body = input as Record<string, unknown>;

  const amount = body.amount;
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount < MIN_TOPUP_AMOUNT
  ) {
    return {
      ok: false,
      error: `Top-up amount must be at least ${MIN_TOPUP_AMOUNT.toLocaleString()} MMK.`,
    };
  }

  if (!isPaymentProvider(body.method)) {
    return { ok: false, error: "Payment method must be KBZPay or WavePay." };
  }

  const transactionId =
    typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!transactionId) {
    return {
      ok: false,
      error:
        "Transaction ID is required — copy it from your KBZPay / WavePay app after sending the money.",
    };
  }
  if (transactionId.length > MAX_TRANSACTION_ID_LENGTH) {
    return { ok: false, error: "Transaction ID is too long." };
  }

  let proofImageBase64: string | null = null;
  if (body.proofImageBase64 != null && body.proofImageBase64 !== "") {
    if (typeof body.proofImageBase64 !== "string") {
      return { ok: false, error: "Screenshot must be an image." };
    }
    const parsed = parseProofImage(body.proofImageBase64);
    if (!parsed) {
      return { ok: false, error: "Screenshot must be an image file." };
    }
    if (parsed.base64.length > MAX_PROOF_IMAGE_BASE64_CHARS) {
      return {
        ok: false,
        error:
          "Screenshot is too large — please use a photo under 1 MB.",
      };
    }
    if (base64ByteSize(parsed.base64) > MAX_PROOF_IMAGE_BYTES) {
      return {
        ok: false,
        error:
          "Screenshot is too large — please use a photo under 1 MB.",
      };
    }
    // Store the value as submitted (data URL when the client sent one)
    // so the admin page can render it directly as an <img> src.
    proofImageBase64 = body.proofImageBase64.trim();
  }

  const phone =
    typeof body.phone === "string" && body.phone.trim()
      ? body.phone.trim()
      : undefined;

  return {
    ok: true,
    value: {
      amount,
      method: body.method,
      phone,
      transactionId,
      proofImageBase64,
    },
  };
}

/**
 * Turn a stored proof value into a usable <img> src, or null when
 * there is no screenshot. Raw base64 (no data-URL prefix) is rendered
 * as JPEG.
 */
export function proofImageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  const parsed = parseProofImage(trimmed);
  if (!parsed) return null;
  return `data:${parsed.mimeType};base64,${parsed.base64}`;
}

// ---------------------------------------------------------------------------
// Payment-setting validation (POST / PATCH /api/admin/payment-settings).
// ---------------------------------------------------------------------------

export interface PaymentSettingInput {
  provider: PaymentProvider;
  accountNumber: string;
  accountName: string;
  enabled: boolean;
}

/**
 * Validate an admin's receiving-account save. All three text fields
 * are required on create (POST); PATCH callers validate only the
 * fields they send — see validatePaymentSettingPatch below.
 */
export function validatePaymentSetting(
  input: unknown,
): ValidationResult<PaymentSettingInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid payment setting." };
  }
  const body = input as Record<string, unknown>;

  if (!isPaymentProvider(body.provider)) {
    return { ok: false, error: "Provider must be KBZPay or WavePay." };
  }
  const accountNumber =
    typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
  if (!accountNumber) {
    return { ok: false, error: "Account number is required." };
  }
  if (accountNumber.length > MAX_ACCOUNT_NUMBER_LENGTH) {
    return { ok: false, error: "Account number is too long." };
  }
  const accountName =
    typeof body.accountName === "string" ? body.accountName.trim() : "";
  if (!accountName) {
    return { ok: false, error: "Account name is required." };
  }
  if (accountName.length > MAX_ACCOUNT_NAME_LENGTH) {
    return { ok: false, error: "Account name is too long." };
  }
  const enabled = body.enabled === undefined ? true : body.enabled;
  if (typeof enabled !== "boolean") {
    return { ok: false, error: "Enabled must be true or false." };
  }

  return {
    ok: true,
    value: {
      provider: body.provider,
      accountNumber,
      accountName,
      enabled,
    },
  };
}

export interface PaymentSettingPatch {
  accountNumber?: string;
  accountName?: string;
  enabled?: boolean;
}

/** Validate a partial update: at least one field, each valid if sent. */
export function validatePaymentSettingPatch(
  input: unknown,
): ValidationResult<PaymentSettingPatch> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid payment setting." };
  }
  const body = input as Record<string, unknown>;
  const patch: PaymentSettingPatch = {};

  if (body.accountNumber !== undefined) {
    const accountNumber =
      typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
    if (!accountNumber) {
      return { ok: false, error: "Account number is required." };
    }
    if (accountNumber.length > MAX_ACCOUNT_NUMBER_LENGTH) {
      return { ok: false, error: "Account number is too long." };
    }
    patch.accountNumber = accountNumber;
  }
  if (body.accountName !== undefined) {
    const accountName =
      typeof body.accountName === "string" ? body.accountName.trim() : "";
    if (!accountName) {
      return { ok: false, error: "Account name is required." };
    }
    if (accountName.length > MAX_ACCOUNT_NAME_LENGTH) {
      return { ok: false, error: "Account name is too long." };
    }
    patch.accountName = accountName;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return { ok: false, error: "Enabled must be true or false." };
    }
    patch.enabled = body.enabled;
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: "Nothing to update — send an account number, account name, or enabled flag.",
    };
  }
  return { ok: true, value: patch };
}
