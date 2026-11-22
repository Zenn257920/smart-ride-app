import { describe, expect, test } from "vitest";
import { normalizePhone } from "../src/lib/phone";

describe("B5: phone normalisation", () => {
  test("already-local number passes through unchanged", () => {
    expect(normalizePhone("09123456789")).toBe("09123456789");
  });

  test("spaces and dashes are stripped", () => {
    expect(normalizePhone("09-123 456 789")).toBe("09123456789");
  });

  test("parentheses are stripped", () => {
    expect(normalizePhone("(09) 123-456-789")).toBe("09123456789");
  });

  test("leading +95 country code becomes the local 0 prefix", () => {
    expect(normalizePhone("+959123456789")).toBe("09123456789");
  });

  test("+95 with spaces/dashes is stripped first, then converted", () => {
    expect(normalizePhone("+95 9-123 456 789")).toBe("09123456789");
  });

  test("bare leading 95 (plus omitted) is converted too", () => {
    expect(normalizePhone("959123456789")).toBe("09123456789");
  });

  test("surrounding whitespace is trimmed", () => {
    expect(normalizePhone("  09123456789  ")).toBe("09123456789");
  });

  test("non-phone input passes through unchanged", () => {
    expect(normalizePhone("you@example.com")).toBe("you@example.com");
    expect(normalizePhone("")).toBe("");
  });

  test("every spelling of the same number normalises to the same stored form", () => {
    const forms = [
      "09123456789",
      "09-123 456 789",
      "(09)123456789",
      "+959123456789",
      "959123456789",
    ];
    for (const f of forms) {
      expect(normalizePhone(f)).toBe("09123456789");
    }
  });
});
