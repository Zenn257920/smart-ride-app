"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const STATS = [
  { num: "15,000+", label: "နေ့စဉ် ခရီးသည်များ" },
  { num: "67%", label: "ပျမ်းမျှ ငွေသက်သာမှု" },
  { num: "၃ မိနစ်", label: "ပျမ်းမျှ AI Matching အချိန်" },
  { num: "98.2%", label: "သုံးစွဲသူ စိတ်တိုင်းကျနှုန်း" },
];

const STEPS = [
  { n: "01", icon: "📍", title: "ပိ့်ဆောင်ရန် နေရာ ရွေးပါ", desc: "ထွက်မည့်နေရာနှင့် ဦးတည်ရာကို App မှ ရွေးချယ်ပါ" },
  { n: "02", icon: "🕐", title: "ထွက်မည့် အချိန် သတ်မှတ်ပါ", desc: "ရုံးတက်/ရုံးဆင်း အချိန်ကို ထည့်ပါ" },
  { n: "03", icon: "👥", title: "AI က ချိတ်ဆက်ပေးသည်", desc: "လမ်းကြောင်းတူ ၂–၃ ဦးနှင့် AI က အလိုအလျောက် ချိတ်ဆက်" },
  { n: "04", icon: "✅", title: "E-Wallet ဖြင့် ပေးချေပါ", desc: "Innovix E-wallet ဖြင့် ပေးချေပါ" },
];

const FEATURES = [
  { icon: "⚡", title: "Book in seconds", desc: "Pick a place and time — AI finds the best car in minutes." },
  { icon: "📍", title: "Track in real-time", desc: "See your ride on the map from pickup to drop-off." },
  { icon: "💳", title: "Easy pay", desc: "Pay with your Innovix E-Wallet or cash — no hassle." },
];

const REVIEWS = [
  { stars: "★★★★★", text: "Demo review — carpooling to downtown is cheaper than a taxi every day, and the pickup is right at my door." },
  { stars: "★★★★★", text: "Demo review — I share my morning commute and the fare split is fair. The app finds riders on my exact route." },
  { stars: "★★★★☆", text: "Demo review — booking takes seconds and the driver arrives on time. Easy to pay from my wallet." },
];

export default function Home() {
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1500);
    return () => clearTimeout(t);
  }, []);

  if (splash) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-forest">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Innovix SharedRide" className="h-20 w-20 rounded-2xl object-contain" />
        <h1 className="mt-4 text-2xl font-medium text-white">Innovix SharedRide</h1>
        <div className="mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-mint" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* Hero — dark green, two columns */}
      <section className="bg-forest">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="min-w-0">
            <p className="badge mb-5"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-forest" /> AI-Powered Carpooling · ရန်ကုန်မြို့</p>
            <h1 className="text-[40px] font-medium leading-[1.1] text-mint sm:text-5xl lg:text-[60px]">
              တက္ကစီခ ၃ ပုံ ၁ ပုံနဲ့ သက်သောင့်သက်သာ ခရီးဆက်ပါ
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/85">
              AI Algorithm ကနေ လမ်းကြောင်းတူ ခရီးသည်များကို အလိုအလျောက် ချိတ်ဆက်ပေးတဲ့ Smart Carpooling
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/find-ride" className="btn-mint px-7 py-3.5 text-base">Ride Now</Link>
              <Link href="/driver/register" className="btn rounded-[12px] border border-mint/60 px-7 py-3.5 text-base text-mint hover:bg-white/10">Register as Driver</Link>
            </div>
            <p className="mt-6 text-sm text-mint/80">★★★★★ · Trusted by 15,000+ daily riders in Yangon</p>
          </div>
          <div className="relative min-w-0">
            <div className="overflow-hidden rounded-[24px]">
              <Image src="/bg2.png" alt="SharedRide car in Yangon" width={900} height={620} className="h-auto w-full object-cover" priority />
            </div>
            <div className="absolute -bottom-5 left-4 right-4 rounded-[20px] bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.25)] sm:left-8 sm:right-8">
              <h2 className="text-base font-medium text-forest">Door-to-door, shared fairly</h2>
              <p className="mt-1 text-sm text-forest/70">AC car, fixed fair split, no surge pricing.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="badge">Door-to-door</span>
                <span className="badge">67% cheaper</span>
                <span className="badge">AI matched</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats — mint ground */}
      <section className="bg-mint">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="min-w-0 text-center">
              <p className="text-3xl font-medium text-forest sm:text-4xl">{s.num}</p>
              <p className="mt-1 text-sm text-forest/70">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features trio — white */}
      <section className="bg-white dark:bg-[#0f2416]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="section-title">Why ride with SharedRide</h2>
          <p className="section-sub max-w-xl">Fast booking, live tracking and easy payment — built for Yangon commutes.</p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <span aria-hidden className="text-3xl">{f.icon}</span>
                <h3 className="mt-3 text-lg font-medium text-forest dark:text-mint">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-forest/70 dark:text-mint/70">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — white */}
      <section className="bg-white dark:bg-[#0f2416]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
          <p className="text-sm font-medium text-forest/60 dark:text-mint/60">▸ အလုပ်လုပ်ပုံ</p>
          <h2 className="section-title mt-1">အဆင့် ၄ ဆင့်သာ</h2>
          <p className="section-sub">App ဖွင့်ပြီး မိနစ်အနည်းငယ်အတွင်း AI က အကောင်းဆုံး ကားနှင့် ချိတ်ဆက်ပေးသည်</p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card relative">
                <span className="text-xs font-medium text-forest/40 dark:text-mint/40">{s.n}</span>
                <span aria-hidden className="mt-2 block text-3xl">{s.icon}</span>
                <h3 className="mt-3 text-base font-medium text-forest dark:text-mint">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-forest/70 dark:text-mint/70">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — white */}
      <section className="bg-white dark:bg-[#0f2416]" id="pricing">
        <div className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
          <h2 className="section-title text-center">ဘာကြောင့် SharedRide ကို ရွေးသနည်း</h2>
          <p className="section-sub mx-auto max-w-xl text-center">ဘတ်စ်ကားထက် ပိုကောင်းပြီး တက္ကစီထက် ဈေးသက်သာသော ဝန်ဆောင်မှု</p>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="card text-center">
              <span aria-hidden className="text-4xl">🚌</span>
              <h3 className="mt-3 text-lg font-medium">ဘတ်စ်ကား</h3>
              <p className="mt-2 text-3xl font-medium text-forest/50 dark:text-mint/50">500</p>
              <p className="text-sm text-forest/60 dark:text-mint/60">ကျပ်</p>
              <p className="mt-3 text-sm leading-relaxed text-forest/70 dark:text-mint/70">ဈေးသက်သာသော်လည်း တိုးဝှေ့စီးရ၍ သက်သောင့်သက်သာမရှိ၊ မှတ်တိုင်နှင့်ကွာဝေးသည်</p>
            </div>
            <div className="card relative text-center ring-2 ring-forest dark:ring-mint">
              <span className="badge absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">⭐ SharedRide — အကောင်းဆုံး</span>
              <span aria-hidden className="text-4xl">🚗</span>
              <h3 className="mt-3 text-lg font-medium">SmartRide Carpool (၃ ဦး)</h3>
              <p className="mt-2 text-3xl font-medium">2,200</p>
              <p className="text-sm text-forest/60 dark:text-mint/60">ကျပ် / တစ်ဦး (~10km)</p>
              <p className="mt-3 text-sm leading-relaxed text-forest/70 dark:text-mint/70">AC ကား၊ Door-to-Door ဝန်ဆောင်မှု<br />တက္ကစီနှင့် ယှဉ်လျှင် <strong>67% သက်သာ</strong><br />ဘတ်စ်ကားထက် သက်သောင့်သက်သာ</p>
            </div>
            <div className="card text-center">
              <span aria-hidden className="text-4xl">🚕</span>
              <h3 className="mt-3 text-lg font-medium">ပုံမှန် တက္ကစီ (တစ်ဦး)</h3>
              <p className="mt-2 text-3xl font-medium">6,500</p>
              <p className="text-sm text-forest/60 dark:text-mint/60">ကျပ် (10km)</p>
              <p className="mt-3 text-sm leading-relaxed text-forest/70 dark:text-mint/70">သီးသန့်ဝန်ဆောင်မှု၊ သက်သောင့်သက်သာ သော်လည်း နေ့တိုင်းစီးရန် ဈေးကြီးလွန်း</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted drivers + reviews — white */}
      <section className="bg-white dark:bg-[#0f2416]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
          <h2 className="section-title">Trusted drivers</h2>
          <p className="section-sub max-w-xl">Drivers register with a licence and NRC, and every ride can be rated by its passengers.</p>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {REVIEWS.map((r, i) => (
              <div key={i} className="card">
                <p className="text-mint-deep" aria-label="Rating">{r.stars}</p>
                <p className="mt-2 text-sm leading-relaxed text-forest/80 dark:text-mint/80">{r.text}</p>
                <p className="mt-3 text-xs text-forest/50 dark:text-mint/50">Demo review — no real rider name shown</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/find-ride" className="btn-primary px-7 py-3.5 text-base">Ride Now</Link>
            <Link href="/driver/register" className="btn-outline px-7 py-3.5 text-base">Register as Driver</Link>
          </div>
        </div>
      </section>

      {/* Dark-green panel */}
      <section className="bg-forest">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h2 className="text-2xl font-medium leading-tight text-mint sm:text-3xl">Ready to ride for a third of a taxi fare?</h2>
            <p className="mt-2 text-sm text-white/80">Create an account, pick your route, and let AI match you in about ၃ မိနစ်.</p>
          </div>
          <Link href="/register" className="btn-mint shrink-0 px-7 py-3.5 text-base">Get started</Link>
        </div>
      </section>
    </div>
  );
}
