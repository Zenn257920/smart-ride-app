"use client";

import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { apiFetch, asArray, fmtMMK, fmtTime, type WalletTx } from "@/lib/api";
import { MAX_PROOF_IMAGE_BASE64_CHARS } from "@/lib/payment-settings";
import { Camera, Check, Hourglass, X } from "lucide-react";

// Feature A — guided manual top-up (2026-11-23):
//   Step 1: amount + provider (a provider with no enabled receiving
//     account shows as unavailable — nothing is hardcoded).
//   Step 2: the admin-configured receiving account (number + name)
//     with a copy button + the exact amount + Burmese instructions.
//   Step 3: transaction ID (required) + receipt screenshot (optional).
//   Step 4: pending — the admin confirms it, as before.
type TopupStep = 1 | 2 | 3 | 4;

interface ReceivingAccount {
  provider: string;
  accountNumber: string;
  accountName: string;
}

export default function WalletPage() {
  return (
    <AuthGuard>
      <WalletInner />
    </AuthGuard>
  );
}

function WalletInner() {
  const [balance, setBalance] = useState<number | null>(null);
  // D8a: prepayments held for ride requests still 'open' — already out
  // of the spendable balance, shown separately so the user can tell
  // held money apart from money that is gone.
  const [heldPrepayments, setHeldPrepayments] = useState<number>(0);
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
  // Feature A: receiving accounts from GET /api/payment-settings
  // (enabled rows only). Loaded when the modal opens.
  const [paySettings, setPaySettings] = useState<ReceivingAccount[] | null>(null);
  const [paySettingsError, setPaySettingsError] = useState("");
  const [topupTxnId, setTopupTxnId] = useState("");
  const [topupProof, setTopupProof] = useState("");
  const [topupProofName, setTopupProofName] = useState("");
  const [copied, setCopied] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const receivingAccount = paySettings?.find((s) => s.provider === topupMethod) ?? null;
  const isMethodAvailable = receivingAccount != null;

  async function loadPaySettings() {
    setPaySettings(null);
    setPaySettingsError("");
    try {
      const data = await apiFetch<{ settings?: ReceivingAccount[] }>("/api/payment-settings");
      const settings = data.settings ?? [];
      setPaySettings(settings);
      // Prefer a provider that is actually available.
      if (!settings.some((s) => s.provider === topupMethod) && settings.length > 0) {
        setTopupMethod(settings[0].provider as "KBZPay" | "WavePay");
      }
    } catch (e) {
      setPaySettingsError(e instanceof Error ? e.message : "Could not load payment accounts.");
    }
  }

  function openTopup() {
    setTopupOpen(true);
    setTopupStep(1);
    setTopupError("");
    setTopupTxnId("");
    setTopupProof("");
    setTopupProofName("");
    setCopied(false);
    loadPaySettings();
  }

  function closeTopup() {
    setTopupOpen(false);
    setTopupAmount("");
    setTopupPhone("");
    setTopupTxnId("");
    setTopupProof("");
    setTopupProofName("");
    setTopupStep(1);
  }

  async function copyAccountNumber() {
    if (!receivingAccount) return;
    try {
      await navigator.clipboard.writeText(receivingAccount.accountNumber);
    } catch {
      // Clipboard API unavailable (older WebView): fall back to a
      // selectable input the user can long-press to copy.
      const input = document.getElementById("receivingAccountNumber") as HTMLInputElement | null;
      input?.focus();
      input?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function onProofFile(file: File | undefined) {
    setTopupError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setTopupError("ပုံဖိုင် (JPG/PNG) သာ ရွေးပါ။");
      return;
    }
    if (file.size > 1024 * 1024) {
      setTopupError("ပုံက 1 MB ထက် ကြီးနေပါတယ် — ပိုသေးတဲ့ ပုံ ရွေးပါ။");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (dataUrl.length > MAX_PROOF_IMAGE_BASE64_CHARS + 30) {
        setTopupError("ပုံက 1 MB ထက် ကြီးနေပါတယ် — ပိုသေးတဲ့ ပုံ ရွေးပါ။");
        return;
      }
      setTopupProof(dataUrl);
      setTopupProofName(file.name);
    };
    reader.onerror = () => setTopupError("ပုံကို ဖတ်မရပါ — ထပ်စမ်းပါ။");
    reader.readAsDataURL(file);
  }

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  // A3 idempotency: one key per withdraw-dialog-open. A retry of THIS
  // withdrawal replays the stored result instead of withdrawing twice;
  // opening the dialog again mints a fresh key.
  const withdrawKeyRef = useRef("");
  useEffect(() => {
    if (withdrawOpen) withdrawKeyRef.current = crypto.randomUUID();
  }, [withdrawOpen]);

  async function load() {
    try {
      const [bal, list] = await Promise.all([
        apiFetch<{ balance?: number; heldPrepayments?: number }>("/api/wallet/balance"),
        apiFetch<unknown>("/api/wallet/transactions"),
      ]);
      setBalance(typeof bal.balance === "number" ? bal.balance : (bal as { data?: { balance?: number } }).data?.balance ?? null);
      setHeldPrepayments(typeof bal.heldPrepayments === "number" ? bal.heldPrepayments : 0);
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
    if (!topupTxnId.trim()) {
      setTopupError("ငွေလွှဲနံပါတ် (Transaction ID) ထည့်ပါ — သင့် KBZPay / WavePay အက်ပ်က လွှဲပြီးသား ပြေစာမှာ ပါပါတယ်။");
      return;
    }
    setTopupBusy(true);
    try {
      await apiFetch("/api/wallet/topup", {
        method: "POST",
        body: JSON.stringify({
          amount,
          method: topupMethod,
          phone: topupPhone,
          transactionId: topupTxnId.trim(),
          proofImageBase64: topupProof || undefined,
        }),
      });
      setTopupStep(4);
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
        headers: { "Idempotency-Key": withdrawKeyRef.current },
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
      <h1 className="page-title">ငွေအိတ်</h1>
      <p className="section-sub">သင့် Innovix E-Wallet — လက်ကျန်ငွေသည် ငွေလွှဲပြောင်းမှု မှတ်တမ်း (ledger) ၏ ပေါင်းလဒ် ဖြစ်သည်။</p>

      {notice ? <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="card mt-5 bg-forest !p-6 text-mint dark:bg-forest">
        <p className="text-sm text-mint/80">လက်ရှိ လက်ကျန်ငွေ</p>
        <p className="mt-1 text-4xl font-medium">{loading ? "…" : balance != null ? fmtMMK(balance) : "—"}</p>
        {heldPrepayments > 0 ? (
          <p className="mt-2 text-sm text-mint/80">
            <Hourglass aria-hidden className="mr-1 inline h-4 w-4" />ဖွင့်ထားသော ခရီးစဉ် တောင်းဆိုမှုများအတွက် ထိန်းထားသောငွေ: {fmtMMK(heldPrepayments)} — တောင်းဆိုမှု လက်ခံခြင်း / ပယ်ဖျက်ခြင်း ပြုလုပ်သောအခါ ပြန်လည် ရှင်းလင်းပါမည်။
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-mint" onClick={openTopup}>+ ငွေဖြည့်မယ်</button>
          <button type="button" className="btn rounded-[12px] border border-mint/60 px-5 py-3 text-sm text-mint hover:bg-white/10" onClick={() => { setWithdrawOpen(true); setWithdrawError(""); }}>ငွေထုတ်မယ်</button>
        </div>
      </div>

      {pendingTopups.length > 0 ? (
        <div className="mt-4 rounded-[20px] bg-mint-soft p-4 text-sm dark:bg-forest-soft">
          <p className="font-medium"><Hourglass aria-hidden className="mr-1 inline h-4 w-4" />အတည်ပြုချက် စောင့်နေသော ငွေဖြည့်မှု {pendingTopups.length} ခု</p>
          <p className="mt-1 text-forest/70 dark:text-mint/70">သင့်လွှဲပြောင်းမှုကို စောင့်ဆိုင်းနေသည့် အခြေအနေဖြင့် မှတ်တမ်းတင်ထားသည် — စီမံခန့်ခွဲသူက ကိုယ်တိုင် အတည်ပြုပေးပါမည်။ v1 တွင် ငွေ အလိုအလျောက် မလှုပ်ရှားပါ။</p>
        </div>
      ) : null}

      <h2 className="mt-8 text-lg font-medium text-forest dark:text-mint">ငွေလွှဲပြောင်းမှု မှတ်တမ်း</h2>
      <div className="card mt-3">
        {txs.length === 0 ? (
          <p className="text-sm text-forest/60 dark:text-mint/60">ငွေလွှဲပြောင်းမှု မရှိသေးပါ။</p>
        ) : (
          <ul className="divide-y divide-forest/5 dark:divide-mint/5">
            {txs.map((t) => {
              const amount = t.amount ?? 0;
              return (
                <li key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{t.type?.replace(/_/g, " ") ?? "Transaction"}</p>
                    <p className="truncate text-xs text-forest/60 dark:text-mint/60">{t.description ?? ""} · {fmtTime(t.createdAt ?? t.created_at)}</p>
                    {t.status === "pending" ? <span className="badge mt-1">အတည်ပြုချက် စောင့်နေသည်</span> : null}
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
              <h2 className="text-lg font-medium">ငွေအိတ် ငွေဖြည့်ပါ</h2>
              <button type="button" onClick={closeTopup} aria-label="Close" className="inline-flex items-center justify-center rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60"><X aria-hidden className="h-4 w-4" /></button>
            </div>

            {topupStep === 1 ? (
              <>
                <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">အဆင့် ၁ / ၃ — ပမာဏနှင့် ငွေပေးချေမှု နည်းလမ်း ရွေးပါ။</p>
                <label htmlFor="topupAmount" className="label mt-4">Amount (MMK, min 1,000)</label>
                <input id="topupAmount" className="input" type="number" min={1000} step={500} value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="e.g. 10000" />
                {paySettings === null && !paySettingsError ? (
                  <p className="mt-3 text-sm text-forest/60 dark:text-mint/60">ငွေပေးချေမှု အကောင့်များ ဖတ်နေသည်…</p>
                ) : null}
                {paySettingsError ? (
                  <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
                    {paySettingsError} <button type="button" className="underline" onClick={loadPaySettings}>ပြန်စမ်းပါ</button>
                  </p>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["KBZPay", "WavePay"] as const).map((m) => {
                    const available = paySettings?.some((s) => s.provider === m) ?? false;
                    const disabled = paySettings !== null && !available;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        onClick={() => setTopupMethod(m)}
                        aria-pressed={topupMethod === m}
                        className={`rounded-[12px] border-2 p-3 text-left ${topupMethod === m && !disabled ? "border-forest bg-mint-soft dark:border-mint dark:bg-forest-soft" : "border-forest/15 dark:border-mint/15"} ${disabled ? "opacity-50" : ""}`}
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
                        <span className="mt-1 block text-xs text-forest/60 dark:text-mint/60">
                          {paySettings === null
                            ? "Mobile payment"
                            : disabled
                              ? "မရသေးပါ — စီမံခန့်ခွဲသူက အကောင့် မသတ်မှတ်ရသေးပါ"
                              : "Mobile payment"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label htmlFor="topupPhone" className="label mt-4">Your {topupMethod} phone number</label>
                <input id="topupPhone" className="input" type="tel" value={topupPhone} onChange={(e) => setTopupPhone(e.target.value)} placeholder="09xxxxxxxxx" />
                {topupError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{topupError}</p> : null}
                <button type="button" className="btn-primary mt-5 w-full" disabled={paySettings === null} onClick={() => {
                  const amount = Number(topupAmount);
                  if (!amount || amount < 1000) { setTopupError("Top-up amount must be at least 1,000 MMK."); return; }
                  if (!isMethodAvailable) { setTopupError("ဒီနည်းလမ်းနဲ့ ငွေဖြည့်လို့ မရသေးပါ — စီမံခန့်ခွဲသူက အကောင့် မသတ်မှတ်ရသေးပါ။ အခြား နည်းလမ်း ရွေးပါ။"); return; }
                  setTopupError("");
                  setTopupStep(2);
                }}>ဆက်သွားမယ် →</button>
              </>
            ) : topupStep === 2 ? (
              <>
                <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">အဆင့် ၂ / ၃ — ငွေလွှဲပါ။</p>
                <p className="mt-3 text-sm leading-relaxed">
                  သင့် <strong>{topupMethod}</strong> အက်ပ်ကို ဖွင့်ပြီး အောက်ပါ အကောင့်သို့ <strong>{fmtMMK(Number(topupAmount))}</strong> တိတိကျကျ လွှဲပါ။ လွှဲပြီးရင် ငွေလွှဲနံပါတ် (Transaction ID) ကို မှတ်ထားပါ — နောက် အဆင့်မှာ ထည့်ရပါမယ်။
                </p>
                {receivingAccount ? (
                  <div className="mt-4 rounded-[16px] bg-mint-soft p-4 dark:bg-forest-soft">
                    <p className="text-xs text-forest/60 dark:text-mint/60">လက်ခံမည့် အကောင့် — {receivingAccount.provider}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id="receivingAccountNumber"
                        className="input !mt-0 flex-1 font-mono text-base font-medium tracking-wide"
                        readOnly
                        value={receivingAccount.accountNumber}
                        aria-label="Receiving account number"
                        onFocus={(e) => e.target.select()}
                      />
                      <button type="button" className="btn-primary shrink-0 !px-4 !py-2.5 text-sm" onClick={copyAccountNumber}>
                        {copied ? (<><Check aria-hidden className="mr-1 inline h-4 w-4" />ကူးပြီးပါပြီ</>) : "ကူးယူမယ်"}
                      </button>
                    </div>
                    <p className="mt-2 text-sm">အကောင့်အမည်: <strong>{receivingAccount.accountName}</strong></p>
                    <p className="mt-1 text-sm">လွှဲရမည့် ပမာဏ: <strong>{fmtMMK(Number(topupAmount))}</strong></p>
                  </div>
                ) : (
                  <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
                    ဒီနည်းလမ်းအတွက် လက်ခံမည့် အကောင့် မရှိသေးပါ — နောက်သို့ ပြန်ပြီး အခြား နည်းလမ်း ရွေးပါ။
                  </p>
                )}
                {topupError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{topupError}</p> : null}
                <div className="mt-5 flex gap-3">
                  <button type="button" className="btn-outline flex-1" onClick={() => setTopupStep(1)}>နောက်သို့</button>
                  <button type="button" className="btn-primary flex-1" disabled={!receivingAccount} onClick={() => setTopupStep(3)}>လွှဲပြီးပါပြီ →</button>
                </div>
              </>
            ) : topupStep === 3 ? (
              <>
                <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">အဆင့် ၃ / ၃ — ငွေလွှဲ အထောက်အထား တင်ပြပါ။</p>
                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt>Amount</dt><dd className="font-medium">{fmtMMK(Number(topupAmount))}</dd></div>
                  <div className="flex justify-between"><dt>Method</dt><dd>{topupMethod}</dd></div>
                  {receivingAccount ? <div className="flex justify-between"><dt>To account</dt><dd>{receivingAccount.accountNumber} ({receivingAccount.accountName})</dd></div> : null}
                </dl>
                <label htmlFor="topupTxnId" className="label mt-4">ငွေလွှဲနံပါတ် (Transaction ID) *</label>
                <input
                  id="topupTxnId"
                  className="input"
                  type="text"
                  autoComplete="off"
                  value={topupTxnId}
                  onChange={(e) => setTopupTxnId(e.target.value)}
                  placeholder="e.g. KBZ123456789"
                />
                <p className="mt-1 text-xs text-forest/60 dark:text-mint/60">သင့် {topupMethod} အက်ပ်က လွှဲပြီးသား ပြေစာမှာ ပါတဲ့ နံပါတ်ပါ — စီမံခန့်ခွဲသူက ဒီနံပါတ်နဲ့ တိုက်ဆိုင် စစ်ဆေးပါမယ်။</p>
                <label className="label mt-4">ပြေစာ Screenshot (မဖြစ်မနေ မဟုတ်ပါ — 1 MB အောက်)</label>
                <input
                  ref={proofInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onProofFile(e.target.files?.[0])}
                />
                {topupProof ? (
                  <div className="mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={topupProof} alt="Receipt screenshot preview" className="max-h-48 w-full rounded-[12px] border border-forest/15 object-contain dark:border-mint/15" />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-forest/60 dark:text-mint/60">{topupProofName}</p>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-red-700 underline dark:text-red-300"
                        onClick={() => { setTopupProof(""); setTopupProofName(""); if (proofInputRef.current) proofInputRef.current.value = ""; }}
                      >
                        ဖယ်ရှားမယ်
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn-outline mt-2 w-full" onClick={() => proofInputRef.current?.click()}>
                    <Camera aria-hidden className="mr-1.5 inline h-4 w-4" />Screenshot ရွေးမယ်
                  </button>
                )}
                {topupError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{topupError}</p> : null}
                <div className="mt-5 flex gap-3">
                  <button type="button" className="btn-outline flex-1" onClick={() => setTopupStep(2)}>နောက်သို့</button>
                  <button type="button" className="btn-primary flex-1" disabled={topupBusy} onClick={submitTopup}>{topupBusy ? "တင်ပြနေသည်…" : "ငွေဖြည့်မှုကို တင်ပြမယ်"}</button>
                </div>
              </>
            ) : (
              <>
                <Hourglass aria-hidden className="mt-2 h-10 w-10 text-forest dark:text-mint" />
                <h3 className="mt-2 text-lg font-medium">ငွေဖြည့်မှု တင်ပြီးပါပြီ — အတည်ပြုချက် စောင့်နေသည်</h3>
                <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                  {fmtMMK(Number(topupAmount))} via {topupMethod} is recorded as PENDING. Your balance updates once an admin confirms the transfer.
                </p>
                <button type="button" className="btn-primary mt-5 w-full" onClick={closeTopup}>ပြီးပါပြီ</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {withdrawOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Withdraw">
          <div className="card w-full max-w-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">ငွေထုတ်ပါ</h2>
              <button type="button" onClick={() => setWithdrawOpen(false)} aria-label="Close" className="inline-flex items-center justify-center rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60"><X aria-hidden className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">Available: {balance != null ? fmtMMK(balance) : "—"}</p>
            <label htmlFor="withdrawAmount" className="label mt-4">Amount (MMK, min 1,000)</label>
            <input id="withdrawAmount" className="input" type="number" min={1000} step={500} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="e.g. 5000" />
            {withdrawError ? <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{withdrawError}</p> : null}
            <button type="button" className="btn-primary mt-5 w-full" disabled={withdrawBusy} onClick={submitWithdraw}>{withdrawBusy ? "ဆောင်ရွက်နေသည်…" : "ငွေထုတ်မယ်"}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
