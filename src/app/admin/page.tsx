"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { apiFetch, fmtMMK } from "@/lib/api";

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

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminInner />
    </AuthGuard>
  );
}

function AdminInner() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await apiFetch<{ isAdmin?: boolean }>("/api/admin/me");
      if (!me.isAdmin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      const [t, d, l] = await Promise.all([
        apiFetch<{ topups?: Topup[] }>("/api/admin/topups"),
        apiFetch<{ drivers?: DriverRow[] }>("/api/admin/drivers"),
        apiFetch<{ transactions?: LedgerRow[] }>("/api/admin/ledger"),
      ]);
      setTopups(t.topups ?? []);
      setDrivers(d.drivers ?? []);
      setLedger(l.transactions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the admin section.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading) {
    return (
      <div className="page-wrap">
        <p className="text-sm text-forest/60 dark:text-mint/60">Loading admin…</p>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="page-wrap max-w-xl">
        <div className="card text-center">
          <h1 className="page-title">Admin only</h1>
          <p className="section-sub mt-2">This section is only for admins. If you should be an admin, ask an existing admin to enable it for your account.</p>
        </div>
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
                    <p className="font-medium">{d.userName ?? "Unknown"} · {d.verified ? "Verified ✓" : "Not verified"}</p>
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
