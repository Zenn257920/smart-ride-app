"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizePhone } from "@/lib/phone";
import { Car, Users, type LucideIcon } from "lucide-react";

type Step = "email" | "otp" | "details";

const RESEND_COOLDOWN_SEC = 60;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [verifiedToken, setVerifiedToken] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // One account = one role, chosen once at signup and never changed.
  // A person who wants both roles registers two accounts with two
  // emails. Passenger is the default.
  const [role, setRole] = useState<"passenger" | "driver">("passenger");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown countdown (60s after each send).
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function postJson(path: string, payload: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: string;
      attemptsLeft?: number;
      token?: string;
      ok?: boolean;
    } | null;
    if (!res.ok) {
      throw new Error(data?.error || "ထပ်ကြိုးစားကြည့်ပါ။");
    }
    return data ?? {};
  }

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setInfo("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("အီးမေးလ် ထည့်ပါ။");
      return;
    }
    setLoading(true);
    try {
      await postJson("/api/auth/otp/send", { email: trimmed });
      setInfo("အတည်ပြုကုဒ် ပို့လိုက်ပါပြီ။ သင့်အီးမေးလ်ကို စစ်ကြည့်ပါ။");
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ကုဒ် ပို့၍ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("ကုဒ်သည် ဂဏန်း ၆ လုံး ဖြစ်ရပါမည်။");
      return;
    }
    setLoading(true);
    try {
      const data = await postJson("/api/auth/otp/verify", {
        email: email.trim(),
        otp: otp.trim(),
      });
      if (!data.token) throw new Error("အတည်ပြုချက် မရပါ။ ထပ်ကြိုးစားပါ။");
      setVerifiedToken(data.token);
      setStep("details");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ကုဒ် မှားနေပါသည်။ ထပ်ကြိုးစားပါ။");
    } finally {
      setLoading(false);
    }
  }

  async function completeSignup(e: React.FormEvent) {
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
      await postJson("/api/auth/otp/complete-signup", {
        email: email.trim(),
        token: verifiedToken,
        name: name.trim(),
        phone: normalizePhone(phone),
        password,
        role,
      });
      // Drivers complete their vehicle profile next; passengers go
      // straight to their dashboard.
      router.push(role === "driver" ? "/driver/register" : "/dashboard");
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

        {/* Step indicator */}
        <ol className="mt-5 flex items-center gap-2 text-xs">
          {(
            [
              ["email", "၁။ အီးမေးလ်"],
              ["otp", "၂။ ကုဒ် အတည်ပြုပါ"],
              ["details", "၃။ အချက်အလက်"],
            ] as [Step, string][]
          ).map(([key, label]) => (
            <li
              key={key}
              className={`rounded-full px-3 py-1 font-medium ${
                step === key
                  ? "bg-forest text-mint dark:bg-mint dark:text-forest"
                  : "bg-mint text-forest dark:bg-forest-soft dark:text-mint"
              }`}
            >
              {label}
            </li>
          ))}
        </ol>

        {step === "email" && (
          <form onSubmit={sendOtp} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label">အီးမေးလ်</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <p className="text-sm text-forest/70 dark:text-mint/70">
              အီးမေးလ်ကို အတည်ပြုကုဒ် (၆ လုံး) ပို့ပေးပါမယ်။ ကုဒ်ကို ရိုက်ထည့်ပြီးမှ အကောင့် ဖွင့်နိုင်ပါတယ်။
            </p>
            {info ? <p className="rounded-[12px] bg-mint px-3 py-2 text-sm text-forest">{info}</p> : null}
            {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "ကုဒ် ပို့နေသည်…" : "အတည်ပြုကုဒ် ပို့မယ်"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="mt-6 space-y-4">
            <p className="text-sm text-forest/70 dark:text-mint/70">
              <span className="font-medium text-forest dark:text-mint">{email.trim()}</span> သို့
              ကုဒ် ပို့လိုက်ပါပြီ။ ကုဒ်ဟာ ၁၀ မိနစ်အတွင်းသာ အကျုံးဝင်ပါတယ်။
            </p>
            <div>
              <label htmlFor="otp" className="label">အတည်ပြုကုဒ် (ဂဏန်း ၆ လုံး)</label>
              <input
                id="otp"
                className="input text-center text-2xl tracking-[0.5em]"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                required
                maxLength={6}
              />
            </div>
            {info ? <p className="rounded-[12px] bg-mint px-3 py-2 text-sm text-forest">{info}</p> : null}
            {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "အတည်ပြုနေသည်…" : "အတည်ပြုမယ်"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError("");
                  setInfo("");
                }}
                className="font-medium text-forest underline dark:text-mint"
              >
                အီးမေးလ် ပြောင်းမယ်
              </button>
              <button
                type="button"
                disabled={loading || cooldown > 0}
                onClick={() => sendOtp()}
                className="font-medium text-forest underline disabled:opacity-50 dark:text-mint"
              >
                {cooldown > 0 ? `ကုဒ် ပြန်တောင်းရန် ${cooldown} စက္ကန့်` : "ကုဒ် ပြန်တောင်းမယ်"}
              </button>
            </div>
          </form>
        )}

        {step === "details" && (
          <form onSubmit={completeSignup} className="mt-6 space-y-4">
            <p className="rounded-[12px] bg-mint px-3 py-2 text-sm text-forest">
              အီးမေးလ် အတည်ပြုပြီးပါပြီ။ အကောင့် အချက်အလက်ကို ဖြည့်ပါ။
            </p>
            <div>
              <label htmlFor="name" className="label">အမည်အပြည့်အစုံ</label>
              <input id="name" className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="သင့်အမည်" required />
            </div>
            <div>
              <label htmlFor="phone" className="label">ဖုန်းနံပါတ်</label>
              <input id="phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxxx" required />
            </div>
            <div>
              <span className="label">အကောင့် အမျိုးအစား</span>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="အကောင့် အမျိုးအစား">
                {(
                  [
                    ["passenger", Users, "ခရီးသည်", "စီးမယ် — ခရီးရှာပြီး ဘွတ်ကင်လုပ်မယ်"],
                    ["driver", Car, "ယာဉ်မောင်း", "မောင်းမယ် — ခရီးစဉ် ကမ်းလှမ်းမယ်"],
                  ] as ["passenger" | "driver", LucideIcon, string, string][]
                ).map(([value, icon, label, desc]) => {
                  const Icon = icon;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      aria-pressed={role === value}
                      className={`rounded-[16px] border-2 p-3 text-left transition-colors ${
                        role === value
                          ? "border-forest bg-mint-soft dark:border-mint dark:bg-forest-soft"
                          : "border-forest/15 bg-white hover:border-forest/40 dark:border-mint/15 dark:bg-[#122b19]"
                      }`}
                    >
                      <Icon aria-hidden className="h-6 w-6 text-forest dark:text-mint" />
                      <span className="mt-1 block font-medium text-forest dark:text-mint">{label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-forest/70 dark:text-mint/70">{desc}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-forest/60 dark:text-mint/60">
                အကောင့် အမျိုးအစားကို ဖွင့်ပြီးမှ ပြောင်း၍ မရပါ။ နှစ်မျိုးလုံး လုပ်ချင်ရင် အီးမေးလ် နှစ်ခုနဲ့ အကောင့် နှစ်ခု ဖွင့်ပါ။
              </p>
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
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "အကောင့်ဖွင့်နေသည်…" : "စာရင်းသွင်းမယ်"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-forest/70 dark:text-mint/70">
          အကောင့် ရှိပြီးသားလား? <Link href="/login" className="font-medium text-forest underline dark:text-mint">အကောင့်ဝင်ပါ</Link>
        </p>
      </div>
    </div>
  );
}
