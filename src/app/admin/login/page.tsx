"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { ADMIN_LOGIN_GENERIC_ERROR } from "@/lib/admin-account";

/**
 * /admin/login — the admin-only sign-in page (2026-11-23).
 *
 * Separate from public /login on purpose: normal users never see an
 * admin entry point, and the admin account is pre-created by
 * scripts/create-admin.ts (never via public signup).
 *
 * Flow: sign in with Better Auth, then check /api/admin/me. Admins go
 * to /admin; anyone else is signed straight back out and sees the one
 * generic error below — the page never says whether the account
 * exists, whether the password was wrong, or whether the account
 * simply is not an admin.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Already signed in as an admin? Skip the form and go to /admin.
  // A signed-in non-admin stays on the form — signing in with admin
  // credentials below replaces their session.
  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ isAdmin?: boolean }>("/api/admin/me")
      .then((me) => {
        if (!cancelled && me.isAdmin) router.replace("/admin");
        else if (!cancelled) setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, session, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn.email({ email: email.trim(), password });
      if (res?.error) throw new Error(ADMIN_LOGIN_GENERIC_ERROR);
      const me = await apiFetch<{ isAdmin?: boolean }>("/api/admin/me");
      if (!me.isAdmin) {
        // Signed in fine, but not an admin: sign straight back out so
        // no non-admin session lingers from this page.
        await signOut();
        throw new Error(ADMIN_LOGIN_GENERIC_ERROR);
      }
      router.push("/admin");
      router.refresh();
    } catch {
      // One generic message for every failure — see the comment at the
      // top of this file. The real reason is never shown.
      setError(ADMIN_LOGIN_GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="page-wrap max-w-md">
        <p className="text-sm text-forest/60 dark:text-mint/60">စစ်ဆေးနေသည်…</p>
      </div>
    );
  }

  return (
    <div className="page-wrap max-w-md">
      <div className="card">
        <h1 className="page-title">စီမံခန့်ခွဲသူ အကောင့်ဝင်ပါ</h1>
        <p className="section-sub">စီမံခန့်ခွဲသူ အကောင့်ဖြင့်သာ ဝင်ရောက်နိုင်ပါသည်။</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="admin-email" className="label">အီးမေးလ်</label>
            <input
              id="admin-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="label">စကားဝှက်</label>
            <input
              id="admin-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="စီမံခန့်ခွဲသူ စကားဝှက်"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "ဝင်ရောက်နေသည်…" : "စီမံခန့်ခွဲသူ အကောင့်ဝင်မယ်"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-forest/70 dark:text-mint/70">
          သာမန် အကောင့်နဲ့ ဝင်မလား?{" "}
          <Link href="/login" className="font-medium text-forest underline dark:text-mint">
            အကောင့်ဝင်ပါ
          </Link>
        </p>
      </div>
    </div>
  );
}
