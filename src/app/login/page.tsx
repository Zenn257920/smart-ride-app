"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";

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
      // B5: normalise the phone first (spaces/dashes stripped, +95 ->
      // 0) so a number typed differently from registration still logs
      // in — the check and the lookup both use the normalised form.
      const normalized = normalizePhone(identifier);
      if (looksLikePhone(normalized)) {
        await apiFetch("/api/auth/phone-login", {
          method: "POST",
          body: JSON.stringify({ phone: normalized, password }),
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
      if (res?.error) throw new Error(res.error.message || "အီးမေးလ်နှင့် စကားဝှက်ကို စစ်ပြီး ထပ်ကြိုးစားကြည့်ပါ။");
      const user = (res?.data as { user?: { user_type?: string } } | undefined)?.user;
      router.push(user?.user_type === "driver" ? "/driver/dashboard" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "အကောင့်ဝင်လို့ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap max-w-md">
      <div className="card">
        <h1 className="page-title">အကောင့်ဝင်ပါ</h1>
        <p className="section-sub">ပြန်လည်ကြိုဆိုပါတယ် — အီးမေးလ် သို့မဟုတ် ဖုန်းနံပါတ်ဖြင့် ဝင်ရောက်ပါ။</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="identifier" className="label">အီးမေးလ် သို့မဟုတ် ဖုန်းနံပါတ်</label>
            <input id="identifier" className="input" type="text" inputMode="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com သို့မဟုတ် 09xxxxxxxxx" required />
          </div>
          <div>
            <label htmlFor="password" className="label">စကားဝှက်</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="သင့်စကားဝှက်" required />
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "ဝင်ရောက်နေသည်…" : "အကောင့်ဝင်မယ်"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-forest/70 dark:text-mint/70">
          အကောင့် မရှိသေးဘူးလား? <Link href="/register" className="font-medium text-forest underline dark:text-mint">စာရင်းသွင်းပါ</Link>
        </p>
      </div>
    </div>
  );
}
