"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { apiFetch, asArray, fmtMMK, fmtTime, type WalletTx } from "@/lib/api";

type TopupStep = 1 | 2 | 3;

export default function WalletPage() {
  return (
    <AuthGuard>
      <WalletInner />
    </AuthGuard>
  );
}

function WalletInner() {
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [topupOpen, setTopupOpen] = useState(false);
  const [topupStep, setTopupStep] = useState<TopupStep>(1);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState<"KBZPay" | "WavePay">("KBZPay");
  const [topupPhone, setTopupPhone] = useState("");
  const [topupError, setTopupError] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  async function load() {
    try {
      const [bal, list] = await Promise.all([
        apiFetch<{ balance?: number }>("/api/wallet/balance"),
        apiFetch<unknown>("/api/wallet/transactions"),
      ]);
      setBalance(typeof bal.balance === "number" ? bal.balance : (bal as { data?: { balance?: number } }).data?.balance ?? null);
      setTxs(asArray<WalletTx>(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your wallet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const pendingTopups = txs.filter((t) => t.type === "topup" && t.status === "pending");

  async function submitTopup() {
    const amount = Number(topupAmount);
    setTopupError("");
    if (!amount || amount < 1000) {
      setTopupError("Top-up amount must be at least 1,000 MMK.");
      return;
    }
    setTopupBusy(true);
    try {
      await apiFetch("/api/wallet/topup", {
        method: "POST",
        body: JSON.stringify({ amount, method: topupMethod, phone: topupPhone }),
      });
      setTopupStep(3);
      await load();
    } catch (err) {
      setTopupError(err instanceof Error ? err.message : "Top-up failed. Please try again.");
    } finally {
      setTopupBusy(false);
    }
  }

  async function submitWithdraw() {
    const amount = Number(withdrawAmount);
    setWithdrawError("");
    if (!amount || amount < 1000) {
      setWithdrawError("Withdrawal amount must be at least 1,000 MMK.");
      return;
    }
    if (balance != null && amount > balance) {
      setWithdrawError(`Insufficient balance — you have ${fmtMMK(balance)}.`);
      return;
    }
    setWithdrawBusy(true);
    try {
      await apiFetch("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setNotice(`Withdrawal of ${fmtMMK(amount)} requested.`);
      setWithdrawOpen(false);
      setWithdrawAmount("");
      await load();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Withdrawal failed. Please try again.");
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <div className="page-wrap">
      <h1 className="page-title">Wallet</h1>
      <p className="section-sub">Your Innovix E-Wallet — balance is the sum of your transaction ledger.</p>

      {notice ? <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="card mt-5 bg-forest !p-6 text-mint dark:bg-forest">
        <p className="text-sm text-mint/80">Current balance</p>
        <p className="mt-1 text-4xl font-medium">{loading ? "…" : balance != null ? fmtMMK(balance) : "—"}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-mint" onClick={() => { setTopupOpen(true); setTopupStep(1); setTopupError(""); }}>+ Top up</button>
          <button type="button" className="btn rounded-[12px] border border-mint/60 px-5 py-3 text-sm text-mint hover:bg-white/10" onClick={() => { setWithdrawOpen(true); setWithdrawError(""); }}>Withdraw</button>
        </div>
      </div>

      {pendingTopups.length > 0 ? (
        <div className="mt-4 rounded-[20px] bg-mint-soft p-4 text-sm dark:bg-forest-soft">
          <p className="font-medium">⏳ {pendingTopups.length} top-up{pendingTopups.length === 1 ? "" : "s"} waiting for confirmation</p>
          <p className="mt-1 text-forest/70 dark:text-mint/70">Your transfer is recorded as pending — an admin confirms it manually. No money moves automatically in v1.</p>
        </div>
      ) : null}

      <h2 className="mt-8 text-lg font-medium text-forest dark:text-mint">Transaction history</h2>
      <div className="card mt-3">
        {txs.length === 0 ? (
          <p className="text-sm text-forest/60 dark:text-mint/60">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-forest/5 dark:divide-mint/5">
            {txs.map((t) => {
              const amount = t.amount ?? 0;
              return (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{t.type?.replace(/_/g, " ") ?? "Transaction"}</p>
                    <p className="truncate text-xs text-forest/60 dark:text-mint/60">{t.description ?? ""} · {fmtTime(t.createdAt ?? t.created_at)}</p>
                    {t.status === "pending" ? <span className="badge mt-1">Waiting for confirmation</span> : null}
                  </div>
                  <span className={`shrink-0 text-sm font-medium ${amount >= 0 ? "text-forest dark:text-mint" : "text-red-700 dark:text-red-300"}`}>
                    {amount >= 0 ? "+" : "−"}{fmtMMK(Math.abs(amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {topupOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Top up wallet">
          <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[20px]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">Top up wallet</h2>
              <button type="button" onClick={() => setTopupOpen(false)} aria-label="Close" className="rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60">✕</button>
            </div>

            {topupStep === 1 ? (
              <>
                <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">Step 1 of 2 — amount and payment method.</p>
                <label htmlFor="topupAmount" className="label mt-4">Amount (MMK, min 1,000)</label>
                <input id="topupAmount" className="input" type="number" min={1000} step={500} value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="e.g. 10000" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["KBZPay", "WavePay"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTopupMethod(m)}
                      aria-pressed={topupMethod === m}
                      className={`rounded-[12px] border-2 p-3 text-left ${topupMethod === m ? "border-forest bg-mint-soft dark:border-mint dark:bg-forest-soft" : "border-forest/15 dark:border-mint/15"}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span
                          aria-hidden
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                            m === "KBZPay" ? "bg-[#1d4ed8] text-white" : "bg-[#ffc800] text-[#3d2c00]"
                          }`}
                        >
                          {m === "KBZPay" ? "K" : "W"}
                        </span>
                        {m}
                      </span>
                      <span className="mt-1 block text-xs text-forest/60 dark:text-mint/60">Mobile payment</span>
                    </button>
                  ))}
                </div>
                <label htmlFor="topupPhone" className="label mt-4">Your {topupMethod} phone number</label>
                <input id="topupPhone" className="input" type="tel" value={topupPhone} onChange={(e) => setTopupPhone(e.target.value)} placeholder="09xxxxxxxxx" />
                {topupError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{topupError}</p> : null}
                <button type="button" className="btn-primary mt-5 w-full" onClick={() => {
                  const amount = Number(topupAmount);
                  if (!amount || amount < 1000) { setTopupError("Top-up amount must be at least 1,000 MMK."); return; }
                  setTopupError("");
                  setTopupStep(2);
                }}>Continue →</button>
              </>
            ) : topupStep === 2 ? (
              <>
                <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">Step 2 of 2 — confirm your top-up.</p>
                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt>Amount</dt><dd className="font-medium">{fmtMMK(Number(topupAmount))}</dd></div>
                  <div className="flex justify-between"><dt>Method</dt><dd>{topupMethod}</dd></div>
                  <div className="flex justify-between"><dt>Phone</dt><dd>{topupPhone || "—"}</dd></div>
                </dl>
                <p className="mt-3 rounded-[12px] bg-mint-soft px-3 py-2 text-xs leading-relaxed dark:bg-forest-soft">
                  v1 is manual: this creates a PENDING top-up. Transfer the amount, and an admin confirms it — no real money moves in the app yet.
                </p>
                {topupError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{topupError}</p> : null}
                <div className="mt-5 flex gap-3">
                  <button type="button" className="btn-outline flex-1" onClick={() => setTopupStep(1)}>Back</button>
                  <button type="button" className="btn-primary flex-1" disabled={topupBusy} onClick={submitTopup}>{topupBusy ? "Submitting…" : "Confirm top-up"}</button>
                </div>
              </>
            ) : (
              <>
                <p aria-hidden className="mt-2 text-4xl">⏳</p>
                <h3 className="mt-2 text-lg font-medium">Top-up submitted — waiting for confirmation</h3>
                <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                  {fmtMMK(Number(topupAmount))} via {topupMethod} is recorded as PENDING. Your balance updates once an admin confirms the transfer.
                </p>
                <button type="button" className="btn-primary mt-5 w-full" onClick={() => { setTopupOpen(false); setTopupAmount(""); setTopupPhone(""); setTopupStep(1); }}>Done</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {withdrawOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Withdraw">
          <div className="card w-full max-w-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">Withdraw</h2>
              <button type="button" onClick={() => setWithdrawOpen(false)} aria-label="Close" className="rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60">✕</button>
            </div>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">Available: {balance != null ? fmtMMK(balance) : "—"}</p>
            <label htmlFor="withdrawAmount" className="label mt-4">Amount (MMK, min 1,000)</label>
            <input id="withdrawAmount" className="input" type="number" min={1000} step={500} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="e.g. 5000" />
            {withdrawError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{withdrawError}</p> : null}
            <button type="button" className="btn-primary mt-5 w-full" disabled={withdrawBusy} onClick={submitWithdraw}>{withdrawBusy ? "Processing…" : "Withdraw"}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
