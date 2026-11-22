"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

function looksLikePhone(id: string): boolean {
  const t = id.trim();
  return /^09\d{7,9}$/.test(t) || /^\d{7,}$/.test(t);
}

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (looksLikePhone(identifier)) {
        await apiFetch("/api/auth/phone-login", {
          method: "POST",
          body: JSON.stringify({ phone: identifier.trim(), password }),
        });
        // phone-login returns the Better Auth sign-in response without a
        // user_type, so check driver status directly to pick the landing page.
        try {
          await apiFetch("/api/driver/dashboard");
          router.push("/driver/dashboard");
        } catch {
          router.push("/dashboard");
        }
        router.refresh();
        return;
      }
      const res = await signIn.email({ email: identifier.trim(), password });
      if (res?.error) throw new Error(res.error.message || "Login failed. Check your email and password.");
      const user = (res?.data as { user?: { user_type?: string } } | undefined)?.user;
      router.push(user?.user_type === "driver" ? "/driver/dashboard" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap max-w-md">
      <div className="card">
        <h1 className="page-title">Login</h1>
        <p className="section-sub">Welcome back — sign in with your email or phone number.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="identifier" className="label">Email or phone</label>
            <input id="identifier" className="input" type="text" inputMode="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or 09xxxxxxxxx" required />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required />
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Signing in…" : "Login"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-forest/70 dark:text-mint/70">
          No account yet? <Link href="/register" className="font-medium text-forest underline dark:text-mint">Register</Link>
        </p>
      </div>
    </div>
  );
}
