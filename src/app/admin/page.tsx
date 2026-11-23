"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, fmtMMK } from "@/lib/api";
import { proofImageSrc } from "@/lib/payment-settings";
import { Check } from "lucide-react";

interface Topup {
  id: string;
  userId: string;
  amount: number;
  description: string;
  status: string;
  createdAt?: string;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  // Feature A: the admin checks these against the real transfer
  // before confirming.
  transactionId?: string | null;
  proofImageBase64?: string | null;
}

interface PaymentSetting {
  id: string;
  provider: string;
  accountNumber: string;
  accountName: string;
  enabled: boolean;
}

interface SettingDraft {
  accountNumber: string;
  accountName: string;
  enabled: boolean;
}

const PROVIDERS = ["KBZPay", "WavePay"] as const;

function emptyDraft(): SettingDraft {
  return { accountNumber: "", accountName: "", enabled: true };
}

interface DriverRow {
  id: string;
  userId: string;
  carModel?: string | null;
  carPlate?: string | null;
  verified: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
}

interface LedgerRow {
  id: string;
  userId: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  createdAt?: string;
  userName?: string | null;
  userEmail?: string | null;
}

/**
 * /admin — the admin portal (2026-11-23).
 *
 * Gating: this page does NOT use AuthGuard (which sends everyone to
 * public /login). Instead it checks /api/admin/me itself on load and
 * redirects ANY non-admin — signed out (401) or signed in as a normal
 * user (isAdmin false) — to /admin/login, where admins sign in. While
 * the check is pending only a loading line renders, so admin content
 * never flashes to a non-admin. The API routes are the real enforcement
 * (every /api/admin/* route calls requireAdmin and returns 403); this
 * redirect is the UI half of the same rule.
 */
export default function AdminPage() {
  const router = useRouter();
  const [topups, setTopups] = useState<Topup[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [settings, setSettings] = useState<PaymentSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, SettingDraft>>({});
  const [loading, setLoading] = useState(true);
  // True once we have decided this visitor is not an admin and sent
  // them to /admin/login: keeps the loading line up (instead of the
  // admin page shell) while the redirect happens.
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Raw fetch (not apiFetch) so the 401 for a signed-out visitor
      // can be told apart from a real load failure.
      const meRes = await fetch("/api/admin/me", { credentials: "include" });
      if (meRes.status === 401) {
        setRedirecting(true);
        router.replace("/admin/login");
        return;
      }
      const me = (await meRes.json().catch(() => null)) as {
        isAdmin?: boolean;
      } | null;
      if (!me?.isAdmin) {
        // Signed in, but not an admin: off to the admin sign-in page.
        // Loading stays on so neither admin content nor an error card
        // flashes while the redirect happens.
        setRedirecting(true);
        router.replace("/admin/login");
        return;
      }
      const [t, d, l, s] = await Promise.all([
        apiFetch<{ topups?: Topup[] }>("/api/admin/topups"),
        apiFetch<{ drivers?: DriverRow[] }>("/api/admin/drivers"),
        apiFetch<{ transactions?: LedgerRow[] }>("/api/admin/ledger"),
        apiFetch<{ settings?: PaymentSetting[] }>("/api/admin/payment-settings"),
      ]);
      setTopups(t.topups ?? []);
      setDrivers(d.drivers ?? []);
      setLedger(l.transactions ?? []);
      const loaded = s.settings ?? [];
      setSettings(loaded);
      setDrafts((prev) => {
        const next: Record<string, SettingDraft> = {};
        for (const p of PROVIDERS) {
          const row = loaded.find((r) => r.provider === p);
          next[p] = prev[p] ?? (row
            ? { accountNumber: row.accountNumber, accountName: row.accountName, enabled: row.enabled }
            : emptyDraft());
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the admin section.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(
    key: string,
    fn: () => Promise<unknown>,
    okMsg: string,
  ) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(okMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSetting(provider: string) {
    const draft = drafts[provider] ?? emptyDraft();
    await act(
      `setting-${provider}`,
      () =>
        apiFetch("/api/admin/payment-settings", {
          method: "POST",
          body: JSON.stringify({
            provider,
            accountNumber: draft.accountNumber,
            accountName: draft.accountName,
            enabled: draft.enabled,
          }),
        }),
      `Receiving account for ${provider} saved.`,
    );
  }

  if (loading || redirecting) {
    return (
      <div className="page-wrap">
        <p className="text-sm text-forest/60 dark:text-mint/60">Loading admin…</p>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <h1 className="page-title">Admin</h1>
      <p className="section-sub">Confirm top-ups, verify drivers, and view the wallet ledger.</p>

      {notice ? <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <section className="mt-6">
        <h2 className="text-lg font-medium">Payment settings</h2>
        <p className="section-sub">Receiving accounts users send their top-up money to. Until an account is saved here, that provider shows as unavailable in the wallet top-up flow. Disable a provider to take it offline without deleting its details.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {PROVIDERS.map((p) => {
            const draft = drafts[p] ?? emptyDraft();
            const saved = settings.find((r) => r.provider === p);
            return (
              <div key={p} className="card">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p}</p>
                  <span className="badge">{saved ? (saved.enabled ? "Enabled" : "Disabled") : "Not configured"}</span>
                </div>
                <label htmlFor={`acct-${p}`} className="label mt-3">Account number</label>
                <input
                  id={`acct-${p}`}
                  className="input"
                  type="text"
                  autoComplete="off"
                  value={draft.accountNumber}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [p]: { ...draft, accountNumber: e.target.value } }))}
                  placeholder="e.g. 09123456789"
                />
                <label htmlFor={`name-${p}`} className="label mt-3">Account name</label>
                <input
                  id={`name-${p}`}
                  className="input"
                  type="text"
                  autoComplete="off"
                  value={draft.accountName}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [p]: { ...draft, accountName: e.target.value } }))}
                  placeholder="e.g. Innovix SharedRide"
                />
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [p]: { ...draft, enabled: e.target.checked } }))}
                  />
                  Enabled — users can top up with {p}
                </label>
                <button
                  type="button"
                  className="btn-primary mt-4 w-full"
                  disabled={busy === `setting-${p}`}
                  onClick={() => saveSetting(p)}
                >
                  {busy === `setting-${p}` ? "Saving…" : saved ? "Save changes" : `Save ${p} account`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Pending top-ups ({topups.length})</h2>
        <p className="section-sub">Confirming a top-up credits the passenger&apos;s wallet exactly once. A confirmed top-up cannot be confirmed again.</p>
        {topups.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">No pending top-ups.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {topups.map((t) => (
              <div key={t.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{fmtMMK(t.amount)}</p>
                    <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                      {t.userName ?? "Unknown user"} · {t.userEmail ?? t.userId}
                      {t.userPhone ? ` · ${t.userPhone}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">{t.description}</p>
                    {t.transactionId ? (
                      <p className="mt-1 text-sm">Transaction ID: <span className="font-mono font-medium">{t.transactionId}</span></p>
                    ) : null}
                    {t.proofImageBase64 && proofImageSrc(t.proofImageBase64) ? (
                      <a href={proofImageSrc(t.proofImageBase64) ?? undefined} target="_blank" rel="noreferrer" className="mt-2 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proofImageSrc(t.proofImageBase64) ?? undefined} alt="Receipt screenshot" className="max-h-40 w-full max-w-xs rounded-[12px] border border-forest/15 object-contain dark:border-mint/15" />
                        <span className="text-xs text-forest/60 underline dark:text-mint/60">Open full screenshot</span>
                      </a>
                    ) : null}
                    {t.createdAt ? <p className="mt-1 text-xs text-forest/50 dark:text-mint/50">{new Date(t.createdAt).toLocaleString()}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy === `confirm-${t.id}`}
                      onClick={() => act(`confirm-${t.id}`, () => apiFetch(`/api/admin/topups/${t.id}/confirm`, { method: "POST", body: JSON.stringify({}) }), `Top-up of ${fmtMMK(t.amount)} confirmed.`)}
                    >
                      {busy === `confirm-${t.id}` ? "Confirming…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={busy === `reject-${t.id}`}
                      onClick={() => act(`reject-${t.id}`, () => apiFetch(`/api/admin/topups/${t.id}/reject`, { method: "POST", body: JSON.stringify({}) }), "Top-up rejected.")}
                    >
                      {busy === `reject-${t.id}` ? "Rejecting…" : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Drivers ({drivers.length})</h2>
        <p className="section-sub">Verify a driver after checking their licence/NRC. Unverified drivers see &ldquo;Not verified yet&rdquo;.</p>
        {drivers.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">No drivers registered yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {drivers.map((d) => (
              <div key={d.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{d.userName ?? "Unknown"} · {d.verified ? (<span className="inline-flex items-center gap-1"><Check aria-hidden className="h-4 w-4" />Verified</span>) : "Not verified"}</p>
                    <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                      {d.userEmail ?? d.userId}
                      {d.userPhone ? ` · ${d.userPhone}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                      {d.carModel ?? "—"} {d.carPlate ? `· ${d.carPlate}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={d.verified ? "btn-outline" : "btn-primary"}
                    disabled={busy === `verify-${d.id}`}
                    onClick={() =>
                      act(
                        `verify-${d.id}`,
                        () => apiFetch(`/api/admin/drivers/${d.id}/verify`, { method: "POST", body: JSON.stringify({ verified: !d.verified }) }),
                        d.verified ? "Driver unverified." : "Driver verified.",
                      )
                    }
                  >
                    {busy === `verify-${d.id}` ? "Saving…" : d.verified ? "Unverify" : "Verify"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Ledger (latest {ledger.length})</h2>
        <p className="section-sub">Recent wallet transactions. Balance = sum of completed rows; pending top-ups do not count yet.</p>
        {ledger.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">No transactions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-forest/10 text-left dark:border-mint/10">
                  <th className="py-2 pr-2 font-medium">User</th>
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 pr-2 text-right font-medium">Amount</th>
                  <th className="py-2 pr-2 font-medium">Status</th>
                  <th className="py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-b border-forest/5 dark:border-mint/5">
                    <td className="py-2 pr-2">{row.userName ?? row.userEmail ?? row.userId.slice(0, 8)}</td>
                    <td className="py-2 pr-2">{row.type}</td>
                    <td className={`py-2 pr-2 text-right font-medium ${row.amount >= 0 ? "text-forest dark:text-mint" : "text-red-700 dark:text-red-300"}`}>
                      {row.amount >= 0 ? "+" : "−"}{fmtMMK(Math.abs(row.amount))}
                    </td>
                    <td className="py-2 pr-2">{row.status}</td>
                    <td className="py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
