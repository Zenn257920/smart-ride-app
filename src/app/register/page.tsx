"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { normalizePhone } from "@/lib/phone";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("စကားဝှက်သည် အနည်းဆုံး ၆ လုံး ရှိရပါမည်။");
      return;
    }
    if (password !== confirm) {
      setError("စကားဝှက်နှစ်ခု မကိုက်ညီပါ။");
      return;
    }
    setLoading(true);
    try {
      const res = await signUp.email({
        email: email.trim(),
        password,
        name: name.trim(),
        // phone is stored as a Better Auth additional field, normalised
        // (B5) so login with any spelling of the same number matches.
        phone: normalizePhone(phone),
      } as { email: string; password: string; name: string; phone: string });
      if (res?.error) throw new Error(res.error.message || "စာရင်းသွင်း၍ မရပါ။");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "စာရင်းသွင်း၍ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap max-w-md">
      <div className="card">
        <h1 className="page-title">အကောင့်အသစ် ဖွင့်ပါ</h1>
        <p className="section-sub">Innovix SharedRide Myanmar မှာ ပါဝင်ပါ — ရန်ကုန်မှာ စီးပါ၊ မောင်းပါ။</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="label">အမည်အပြည့်အစုံ</label>
            <input id="name" className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="သင့်အမည်" required />
          </div>
          <div>
            <label htmlFor="email" className="label">အီးမေးလ်</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div>
            <label htmlFor="phone" className="label">ဖုန်းနံပါတ်</label>
            <input id="phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxxx" required />
          </div>
          <div>
            <label htmlFor="password" className="label">စကားဝှက်</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="အနည်းဆုံး ၆ လုံး" required minLength={6} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="label">စကားဝှက် အတည်ပြုပါ</label>
            <input id="confirmPassword" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="စကားဝှက်ကို ထပ်ရိုက်ပါ" required />
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "အကောင့်ဖွင့်နေသည်…" : "စာရင်းသွင်းမယ်"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-forest/70 dark:text-mint/70">
          အကောင့် ရှိပြီးသားလား? <Link href="/login" className="font-medium text-forest underline dark:text-mint">အကောင့်ဝင်ပါ</Link>
        </p>
      </div>
    </div>
  );
}
