"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";

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
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await signUp.email({
        email: email.trim(),
        password,
        name: name.trim(),
        // phone is stored as a Better Auth additional field
        phone: phone.trim(),
      } as { email: string; password: string; name: string; phone: string });
      if (res?.error) throw new Error(res.error.message || "Registration failed.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap max-w-md">
      <div className="card">
        <h1 className="page-title">Create an account</h1>
        <p className="section-sub">Join Innovix SharedRide Myanmar — ride or drive in Yangon.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </div>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div>
            <label htmlFor="phone" className="label">Phone</label>
            <input id="phone" className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxxx" required />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="label">Confirm password</label>
            <input id="confirmPassword" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" required />
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Creating account…" : "Register"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-forest/70 dark:text-mint/70">
          Already have an account? <Link href="/login" className="font-medium text-forest underline dark:text-mint">Login</Link>
        </p>
      </div>
    </div>
  );
}
