import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The app does NO AI/Gemini matching — routes are matched by location and
// time. Nothing the user can see (rendered text, metadata, aria labels,
// manifest) may claim otherwise. Code comments / internal docs may still
// mention AI as history (e.g. src/lib/matching.ts); this test only scans
// the user-facing sources.
const USER_FACING_DIRS = ["src/app", "src/components"];
const USER_FACING_FILES = ["public/manifest.webmanifest"];

const BANNED: RegExp[] = [
  /AI-Powered/,
  /AI Matching/,
  /AI Algorithm/,
  /AI က/,
  /AI ချိတ်/,
  /Gemini/i,
  /artificial intelligence/i,
  // Standalone "AI" as its own word (bounded by non-letters), so words
  // like "email" / "available" / "detail" never match.
  /(^|[^\p{L}\p{N}])AI([^\p{L}\p{N}]|$)/u,
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectFiles(p));
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("no AI copy in user-facing strings", () => {
  const files = [
    ...USER_FACING_DIRS.flatMap(collectFiles),
    ...USER_FACING_FILES,
  ];

  test("scans a non-empty set of user-facing files", () => {
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(readFileSync(f, "utf8").length).toBeGreaterThan(0);
  });

  test("no banned AI phrase appears in any user-facing file", () => {
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const pattern of BANNED) {
        if (pattern.test(text)) hits.push(`${f}: matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("honest replacement wording is present (guards against a vacuous pass)", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    expect(home).toContain("လမ်းကြောင်းတူ Carpooling");
    expect(home).toContain("ပျမ်းမျှ ချိတ်ဆက်ချိန်");
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("လမ်းကြောင်းနဲ့ အချိန်တူ ခရီးသည်တွေနဲ့ ချိတ်ဆက်ပေးတဲ့ Carpooling");
    const footer = readFileSync("src/components/Footer.tsx", "utf8");
    expect(footer).toContain("Carpooling Platform");
  });
});
