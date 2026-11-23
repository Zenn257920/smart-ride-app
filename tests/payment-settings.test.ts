import { describe, expect, test } from "vitest";
import {
  availableProviders,
  base64ByteSize,
  findReceivingAccount,
  isProviderAvailable,
  MAX_PROOF_IMAGE_BASE64_CHARS,
  parseProofImage,
  proofImageSrc,
  validatePaymentSetting,
  validatePaymentSettingPatch,
  validateTopupPayload,
  type PaymentSetting,
} from "../src/lib/payment-settings";

const kbz: PaymentSetting = {
  provider: "KBZPay",
  accountNumber: "09123456789",
  accountName: "Innovix SharedRide",
  enabled: true,
};
const waveDisabled: PaymentSetting = {
  provider: "WavePay",
  accountNumber: "09987654321",
  accountName: "Innovix SharedRide",
  enabled: false,
};

describe("provider availability given admin settings", () => {
  test("a configured + enabled provider is available with its account", () => {
    expect(findReceivingAccount([kbz], "KBZPay")).toEqual({
      provider: "KBZPay",
      accountNumber: "09123456789",
      accountName: "Innovix SharedRide",
    });
    expect(isProviderAvailable([kbz], "KBZPay")).toBe(true);
    expect(availableProviders([kbz])).toEqual(["KBZPay"]);
  });

  test("a provider with no setting is unavailable — never a hardcoded fallback", () => {
    expect(findReceivingAccount([], "KBZPay")).toBeNull();
    expect(findReceivingAccount([kbz], "WavePay")).toBeNull();
    expect(isProviderAvailable([], "WavePay")).toBe(false);
    expect(availableProviders([])).toEqual([]);
  });

  test("a disabled setting makes the provider unavailable", () => {
    expect(findReceivingAccount([kbz, waveDisabled], "WavePay")).toBeNull();
    expect(isProviderAvailable([kbz, waveDisabled], "WavePay")).toBe(false);
    expect(availableProviders([kbz, waveDisabled])).toEqual(["KBZPay"]);
  });

  test("both enabled providers are available, in KBZPay/WavePay order", () => {
    const wave: PaymentSetting = { ...waveDisabled, enabled: true };
    expect(availableProviders([wave, kbz])).toEqual(["KBZPay", "WavePay"]);
  });
});

describe("top-up payload validation", () => {
  const valid = {
    amount: 10000,
    method: "KBZPay",
    transactionId: "KBZ123456789",
  };

  test("a complete payload with transaction ID passes", () => {
    const result = validateTopupPayload(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(10000);
      expect(result.value.method).toBe("KBZPay");
      expect(result.value.transactionId).toBe("KBZ123456789");
      expect(result.value.proofImageBase64).toBeNull();
    }
  });

  test("transaction ID is required — missing, empty, or blank fails", () => {
    const { transactionId: _omit, ...noTxn } = valid;
    expect(validateTopupPayload(noTxn)).toEqual({
      ok: false,
      error: expect.stringContaining("Transaction ID is required"),
    });
    expect(validateTopupPayload({ ...valid, transactionId: "" })).toEqual({
      ok: false,
      error: expect.stringContaining("Transaction ID is required"),
    });
    expect(validateTopupPayload({ ...valid, transactionId: "   " })).toEqual({
      ok: false,
      error: expect.stringContaining("Transaction ID is required"),
    });
  });

  test("transaction ID is trimmed; an over-long one fails", () => {
    const result = validateTopupPayload({
      ...valid,
      transactionId: "  KBZ-1  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.transactionId).toBe("KBZ-1");
    expect(
      validateTopupPayload({ ...valid, transactionId: "x".repeat(101) }),
    ).toEqual({ ok: false, error: "Transaction ID is too long." });
  });

  test("amount below 1000, non-integer, or non-number fails", () => {
    expect(validateTopupPayload({ ...valid, amount: 999 })).toEqual({
      ok: false,
      error: expect.stringContaining("at least 1,000"),
    });
    expect(validateTopupPayload({ ...valid, amount: 1000.5 })).toEqual({
      ok: false,
      error: expect.stringContaining("at least 1,000"),
    });
    expect(validateTopupPayload({ ...valid, amount: "10000" })).toEqual({
      ok: false,
      error: expect.stringContaining("at least 1,000"),
    });
  });

  test("unknown method fails; Cash is not a manual top-up method", () => {
    expect(validateTopupPayload({ ...valid, method: "Cash" })).toEqual({
      ok: false,
      error: "Payment method must be KBZPay or WavePay.",
    });
    expect(validateTopupPayload({ ...valid, method: "kbzpay" })).toEqual({
      ok: false,
      error: "Payment method must be KBZPay or WavePay.",
    });
  });

  test("a small screenshot passes; an oversized one fails", () => {
    const small = `data:image/jpeg;base64,${"a".repeat(1000)}`;
    const okResult = validateTopupPayload({
      ...valid,
      proofImageBase64: small,
    });
    expect(okResult.ok).toBe(true);
    if (okResult.ok) expect(okResult.value.proofImageBase64).toBe(small);

    const huge = `data:image/jpeg;base64,${"a".repeat(MAX_PROOF_IMAGE_BASE64_CHARS + 1)}`;
    expect(
      validateTopupPayload({ ...valid, proofImageBase64: huge }),
    ).toEqual({
      ok: false,
      error: expect.stringContaining("too large"),
    });
  });

  test("a non-image screenshot fails", () => {
    expect(
      validateTopupPayload({
        ...valid,
        proofImageBase64: "data:text/plain;base64,aGVsbG8=",
      }),
    ).toEqual({ ok: false, error: "Screenshot must be an image file." });
    expect(
      validateTopupPayload({
        ...valid,
        proofImageBase64: "not base64 at all!!!",
      }),
    ).toEqual({ ok: false, error: "Screenshot must be an image file." });
  });

  test("raw base64 (no data-URL prefix) is accepted as a screenshot", () => {
    const result = validateTopupPayload({
      ...valid,
      proofImageBase64: "aGVsbG8=",
    });
    expect(result.ok).toBe(true);
  });

  test("null / non-object bodies fail", () => {
    expect(validateTopupPayload(null)).toEqual({
      ok: false,
      error: "Invalid top-up request.",
    });
    expect(validateTopupPayload("nope")).toEqual({
      ok: false,
      error: "Invalid top-up request.",
    });
  });
});

describe("proof image helpers", () => {
  test("parseProofImage splits data URLs and accepts raw base64", () => {
    expect(parseProofImage("data:image/png;base64,aGVsbG8=")).toEqual({
      mimeType: "image/png",
      base64: "aGVsbG8=",
    });
    expect(parseProofImage("aGVsbG8=")).toEqual({
      mimeType: "image/jpeg",
      base64: "aGVsbG8=",
    });
    expect(parseProofImage("data:text/plain;base64,aGVsbG8=")).toBeNull();
    expect(parseProofImage("")).toBeNull();
  });

  test("base64ByteSize accounts for padding", () => {
    // "hello" -> aGVsbG8= (5 bytes, 1 pad char)
    expect(base64ByteSize("aGVsbG8=")).toBe(5);
    // "hi" -> aGk= (2 bytes, 1 pad char); "abc" -> YWJj (3 bytes, no pad)
    expect(base64ByteSize("aGk=")).toBe(2);
    expect(base64ByteSize("YWJj")).toBe(3);
  });

  test("proofImageSrc returns a renderable src or null", () => {
    const dataUrl = "data:image/jpeg;base64,aGVsbG8=";
    expect(proofImageSrc(dataUrl)).toBe(dataUrl);
    expect(proofImageSrc("aGVsbG8=")).toBe(
      "data:image/jpeg;base64,aGVsbG8=",
    );
    expect(proofImageSrc(null)).toBeNull();
    expect(proofImageSrc("")).toBeNull();
    expect(proofImageSrc("not an image!!!")).toBeNull();
  });
});

describe("payment-setting validation (admin)", () => {
  test("a complete setting passes, enabled defaults to true", () => {
    const result = validatePaymentSetting({
      provider: "WavePay",
      accountNumber: "09987654321",
      accountName: "Innovix SharedRide",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(true);
      expect(result.value.accountNumber).toBe("09987654321");
    }
  });

  test("unknown provider, blank account number, blank name fail", () => {
    expect(
      validatePaymentSetting({
        provider: "Cash",
        accountNumber: "1",
        accountName: "X",
      }),
    ).toEqual({ ok: false, error: "Provider must be KBZPay or WavePay." });
    expect(
      validatePaymentSetting({
        provider: "KBZPay",
        accountNumber: "   ",
        accountName: "X",
      }),
    ).toEqual({ ok: false, error: "Account number is required." });
    expect(
      validatePaymentSetting({
        provider: "KBZPay",
        accountNumber: "1",
        accountName: "",
      }),
    ).toEqual({ ok: false, error: "Account name is required." });
  });

  test("non-boolean enabled fails", () => {
    expect(
      validatePaymentSetting({
        provider: "KBZPay",
        accountNumber: "1",
        accountName: "X",
        enabled: "yes",
      }),
    ).toEqual({ ok: false, error: "Enabled must be true or false." });
  });

  test("patch: at least one field, each valid when sent", () => {
    expect(validatePaymentSettingPatch({})).toEqual({
      ok: false,
      error: expect.stringContaining("Nothing to update"),
    });
    expect(validatePaymentSettingPatch({ enabled: false })).toEqual({
      ok: true,
      value: { enabled: false },
    });
    expect(
      validatePaymentSettingPatch({ accountNumber: "  " }),
    ).toEqual({ ok: false, error: "Account number is required." });
    const ok = validatePaymentSettingPatch({
      accountNumber: " 09111 ",
      accountName: "New Name",
    });
    expect(ok).toEqual({
      ok: true,
      value: { accountNumber: "09111", accountName: "New Name" },
    });
  });
});
