"use client";

import { fmtMMK, fmtTime } from "@/lib/api";
import { X } from "lucide-react";
import type { RequestReceiptData } from "@/lib/receipt";

interface RequestReceiptProps {
  receipt: RequestReceiptData;
  /** e.g. go to /ride-requests (find-ride) or switch to the Mine tab. */
  onViewRequest: () => void;
  onClose: () => void;
}

/**
 * Payment receipt shown after creating or joining a ride request.
 *
 * Until now the UI showed one generic line and discarded the join /
 * create response, so the user never saw what was paid. This modal
 * shows the share breakdown, the wallet balance before and after the
 * prepayment, how many riders share now, and what happens next
 * (driver accept -> confirmed; no driver by departure -> full refund;
 * more joiners -> share drops + refund). Amounts only — no phone
 * numbers (C2).
 */
export default function RequestReceipt({
  receipt,
  onViewRequest,
  onClose,
}: RequestReceiptProps) {
  const title =
    receipt.kind === "join"
      ? "တောင်းဆိုမှုမှာ ပါဝင်ပြီးပါပြီ"
      : "တောင်းဆိုမှု ဖန်တီးပြီးပါပြီ";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-b-[20px]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 font-medium">
          {receipt.startLabel} → {receipt.endLabel}
        </p>
        <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
          {fmtTime(receipt.departureTime)} · ခရီးသည် {receipt.memberCount} ဦး
          မျှဝေနေပါတယ်
        </p>

        <div className="mt-4 space-y-2 rounded-[12px] bg-mint-soft p-4 text-sm dark:bg-forest-soft">
          <div className="flex justify-between gap-3">
            <span className="text-forest/70 dark:text-mint/70">ကားခ</span>
            <span className="font-medium">{fmtMMK(receipt.fareShare)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-forest/70 dark:text-mint/70">
              App fee (5%)
            </span>
            <span className="font-medium">{fmtMMK(receipt.appFee)}</span>
          </div>
          <div className="flex justify-between gap-3 border-t border-forest/10 pt-2 dark:border-mint/10">
            <span className="font-medium">စုစုပေါင်း ပေးချေပြီး</span>
            <span className="font-medium">{fmtMMK(receipt.totalPaid)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-forest/70 dark:text-mint/70">
              Wallet — အရင်
            </span>
            <span>{fmtMMK(receipt.balanceBefore)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-forest/70 dark:text-mint/70">
              Wallet — အခု
            </span>
            <span>{fmtMMK(receipt.balanceAfter)}</span>
          </div>
        </div>

        <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">
          ယာဉ်မောင်း လက်ခံဖို့ စောင့်နေပါတယ် — လက်ခံတာနဲ့ ခရီးစဉ်
          အတည်ဖြစ်ပါမည်။ ငွေက ယာဉ်မောင်းဆီကို လက်ခံမှသာ ရောက်ပါတယ်။
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-forest/70 dark:text-mint/70">
          <li>
            ယာဉ်မောင်း လက်ခံရင် ခရီးစဉ် အတည်ဖြစ်ပြီး သင့်ကို
            အကြောင်းကြားပါမည်။
          </li>
          <li>
            ထွက်ချိန်အထိ ယာဉ်မောင်း မရရင် ပေးထားတဲ့ ငွေ အပြည့်အဝ
            ပြန်အမ်းပါမည်။
          </li>
          <li>
            နောက်ထပ် ခရီးသည် ပါဝင်ရင် သင့်ဝေစု လျော့သွားပြီး လျော့သွားတဲ့
            ငွေ ပြန်အမ်းပါမည်။
          </li>
        </ul>

        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-outline flex-1" onClick={onClose}>
            ပိတ်မယ်
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={onViewRequest}
          >
            တောင်းဆိုမှု ကြည့်မယ်
          </button>
        </div>
      </div>
    </div>
  );
}
