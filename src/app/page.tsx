"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bus, Car, CarTaxiFront, ChevronRight, CircleCheck, Clock, CreditCard, MapPin, Star, Users, Zap, type LucideIcon } from "lucide-react";

const STATS = [
  { num: "15,000+", label: "နေ့စဉ် ခရီးသည်များ" },
  { num: "67%", label: "ပျမ်းမျှ ငွေသက်သာမှု" },
  { num: "၃ မိနစ်", label: "ပျမ်းမျှ ချိတ်ဆက်ချိန်" },
  { num: "98.2%", label: "သုံးစွဲသူ စိတ်တိုင်းကျနှုန်း" },
];

const STEPS: { n: string; icon: LucideIcon; title: string; desc: string }[] = [
  { n: "01", icon: MapPin, title: "ပိ့်ဆောင်ရန် နေရာ ရွေးပါ", desc: "ထွက်မည့်နေရာနှင့် ဦးတည်ရာကို App မှ ရွေးချယ်ပါ" },
  { n: "02", icon: Clock, title: "ထွက်မည့် အချိန် သတ်မှတ်ပါ", desc: "ရုံးတက်/ရုံးဆင်း အချိန်ကို ထည့်ပါ" },
  { n: "03", icon: Users, title: "လမ်းကြောင်းတူ ခရီးသည်တွေနဲ့ ချိတ်ဆက်ပေးသည်", desc: "လမ်းကြောင်းတူ ၂–၃ ဦးနှင့် ချိတ်ဆက်ပေးသည်" },
  { n: "04", icon: CircleCheck, title: "E-Wallet ဖြင့် ပေးချေပါ", desc: "Innovix E-wallet ဖြင့် ပေးချေပါ" },
];

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Zap, title: "စက္ကန့်ပိုင်းအတွင်း ဘွတ်ကင်လုပ်ပါ", desc: "နေရာနှင့် အချိန်ကို ရွေးပါ — လမ်းကြောင်းတူ ကားကို မိနစ်ပိုင်းအတွင်း ရှာပေးသည်။" },
  { icon: MapPin, title: "တိုက်ရိုက် ခြေရာခံပါ", desc: "တက်သည့်နေရာမှ ဆင်းသည့်နေရာအထိ သင့်ခရီးစဉ်ကို မြေပုံပေါ်တွင် ကြည့်နိုင်သည်။" },
  { icon: CreditCard, title: "လွယ်ကူစွာ ပေးချေပါ", desc: "Innovix E-Wallet သို့မဟုတ် ငွေသားဖြင့် ပေးချေပါ — အခက်အခဲ မရှိ။" },
];

export default function Home() {
  // B2: the splash shows only on the first visit — once it has played,
  // a flag in localStorage skips it on every later load.
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem("smartride_seen_splash") === "1";
    } catch {
      seen = false;
    }
    if (seen) {
      setSplash(false);
      return;
    }
    const t = setTimeout(() => {
      setSplash(false);
      try {
        localStorage.setItem("smartride_seen_splash", "1");
      } catch {
        /* splash flag is best-effort */
      }
    }, 1500);
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
            <p className="badge mb-5"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-forest" /> လမ်းကြောင်းတူ Carpooling · ရန်ကုန်မြို့</p>
            <h1 className="text-[40px] font-medium leading-[1.1] text-mint sm:text-5xl lg:text-[60px]">
              တက္ကစီခ ၃ ပုံ ၁ ပုံနဲ့ သက်သောင့်သက်သာ ခရီးဆက်ပါ
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/85">
              လမ်းကြောင်းနဲ့ အချိန်တူ ခရီးသည်တွေကို ချိတ်ဆက်ပေးတဲ့ Smart Carpooling
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/find-ride" className="btn-mint px-7 py-3.5 text-base">အခုပဲ ခရီးရှာပါ</Link>
              <Link href="/driver/register" className="btn rounded-[12px] border border-mint/60 px-7 py-3.5 text-base text-mint hover:bg-white/10">ယာဉ်မောင်းအဖြစ် စာရင်းသွင်းပါ</Link>
            </div>
            <p className="mt-6 text-sm text-mint/80"><span className="inline-flex items-center gap-0.5 align-middle" aria-hidden>{[0, 1, 2, 3, 4].map((i) => (<Star key={i} className="h-4 w-4 fill-current" />))}</span> · ရန်ကုန်မြို့မှာ နေ့စဉ် ခရီးသည် 15,000+ က ယုံကြည်သုံးစွဲနေသည်</p>
          </div>
          <div className="relative min-w-0">
            <div className="overflow-hidden rounded-[24px]">
              <Image src="/bg2.png" alt="SharedRide car in Yangon" width={900} height={620} className="h-auto w-full object-cover" priority />
            </div>
            <div className="absolute -bottom-5 left-4 right-4 rounded-[20px] bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,0.25)] sm:left-8 sm:right-8">
              <h2 className="text-base font-medium text-forest">အိမ်တံခါးဝအထိ၊ မျှမျှတတ ခွဲဝေပေးသည်</h2>
              <p className="mt-1 text-sm text-forest/70">AC ကား၊ တည်ငြိမ်သော မျှဝေဈေးနှုန်း၊ ဈေးတက်ခြင်း မရှိ။</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="badge">အိမ်တံခါးဝအထိ</span>
                <span className="badge">67% သက်သာသည်</span>
                <span className="badge">လမ်းကြောင်းတူ ချိတ်ဆက်ပေးသည်</span>
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
          <h2 className="section-title">SharedRide ကို ဘာကြောင့် စီးသနည်း</h2>
          <p className="section-sub max-w-xl">မြန်မြန် ဘွတ်ကင်လုပ်၊ တိုက်ရိုက် ခြေရာခံ၊ လွယ်ကူစွာ ပေးချေ — ရန်ကုန် ရုံးတက်/ရုံးဆင်း ခရီးစဉ်များအတွက် တည်ဆောက်ထားသည်။</p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="card">
                  <Icon aria-hidden className="h-8 w-8 text-forest dark:text-mint" />
                  <h3 className="mt-3 text-lg font-medium text-forest dark:text-mint">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-forest/70 dark:text-mint/70">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works — white */}
      <section className="bg-white dark:bg-[#0f2416]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
          <p className="text-sm font-medium text-forest/60 dark:text-mint/60"><ChevronRight aria-hidden className="mr-0.5 inline h-4 w-4" />အလုပ်လုပ်ပုံ</p>
          <h2 className="section-title mt-1">အဆင့် ၄ ဆင့်သာ</h2>
          <p className="section-sub">App ဖွင့်ပြီး မိနစ်အနည်းငယ်အတွင်း လမ်းကြောင်းတူ ကားနှင့် ချိတ်ဆက်ပေးသည်</p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="card relative">
                  <span className="text-xs font-medium text-forest/40 dark:text-mint/40">{s.n}</span>
                  <Icon aria-hidden className="mt-2 h-8 w-8 text-forest dark:text-mint" />
                  <h3 className="mt-3 text-base font-medium text-forest dark:text-mint">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-forest/70 dark:text-mint/70">{s.desc}</p>
                </div>
              );
            })}
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
              <Bus aria-hidden className="mx-auto h-10 w-10 text-forest dark:text-mint" />
              <h3 className="mt-3 text-lg font-medium">ဘတ်စ်ကား</h3>
              <p className="mt-2 text-3xl font-medium text-forest/50 dark:text-mint/50">500</p>
              <p className="text-sm text-forest/60 dark:text-mint/60">ကျပ်</p>
              <p className="mt-3 text-sm leading-relaxed text-forest/70 dark:text-mint/70">ဈေးသက်သာသော်လည်း တိုးဝှေ့စီးရ၍ သက်သောင့်သက်သာမရှိ၊ မှတ်တိုင်နှင့်ကွာဝေးသည်</p>
            </div>
            <div className="card relative text-center ring-2 ring-forest dark:ring-mint">
              <span className="badge absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap"><Star aria-hidden className="mr-1 inline h-3.5 w-3.5 fill-current" />SharedRide — အကောင်းဆုံး</span>
              <Car aria-hidden className="mx-auto h-10 w-10 text-forest dark:text-mint" />
              <h3 className="mt-3 text-lg font-medium">SmartRide Carpool (၃ ဦး)</h3>
              <p className="mt-2 text-3xl font-medium">2,200</p>
              <p className="text-sm text-forest/60 dark:text-mint/60">ကျပ် / တစ်ဦး (~10km)</p>
              <p className="mt-3 text-sm leading-relaxed text-forest/70 dark:text-mint/70">AC ကား၊ Door-to-Door ဝန်ဆောင်မှု<br />တက္ကစီနှင့် ယှဉ်လျှင် <strong>67% သက်သာ</strong><br />ဘတ်စ်ကားထက် သက်သောင့်သက်သာ</p>
            </div>
            <div className="card text-center">
              <CarTaxiFront aria-hidden className="mx-auto h-10 w-10 text-forest dark:text-mint" />
              <h3 className="mt-3 text-lg font-medium">ပုံမှန် တက္ကစီ (တစ်ဦး)</h3>
              <p className="mt-2 text-3xl font-medium">6,500</p>
              <p className="text-sm text-forest/60 dark:text-mint/60">ကျပ် (10km)</p>
              <p className="mt-3 text-sm leading-relaxed text-forest/70 dark:text-mint/70">သီးသန့်ဝန်ဆောင်မှု၊ သက်သောင့်သက်သာ သော်လည်း နေ့တိုင်းစီးရန် ဈေးကြီးလွန်း</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted drivers — white.
          B1: the fake "Demo review" cards lived here; they are gone
          entirely until there are real rider reviews to show. */}
      <section className="bg-white dark:bg-[#0f2416]">
        <div className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6">
          <h2 className="section-title">ယုံကြည်စိတ်ချရသော ယာဉ်မောင်းများ</h2>
          <p className="section-sub max-w-xl">ယာဉ်မောင်းများသည် လိုင်စင်နှင့် မှတ်ပုံတင်ဖြင့် စာရင်းသွင်းရပြီး၊ ခရီးစဉ်တိုင်းကို ခရီးသည်များက အဆင့်သတ်မှတ်နိုင်သည်။</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/find-ride" className="btn-primary px-7 py-3.5 text-base">အခုပဲ ခရီးရှာပါ</Link>
            <Link href="/driver/register" className="btn-outline px-7 py-3.5 text-base">ယာဉ်မောင်းအဖြစ် စာရင်းသွင်းပါ</Link>
          </div>
        </div>
      </section>

      {/* Dark-green panel */}
      <section className="bg-forest">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h2 className="text-2xl font-medium leading-tight text-mint sm:text-3xl">တက္ကစီခရဲ့ ၃ ပုံ ၁ ပုံနဲ့ စီးဖို့ အဆင်သင့်ဖြစ်ပြီလား?</h2>
            <p className="mt-2 text-sm text-white/80">အကောင့်ဖွင့်ပါ၊ လမ်းကြောင်းကို ရွေးပါ၊ ၃ မိနစ်ခန့်အတွင်း လမ်းကြောင်းတူ ကားနဲ့ ချိတ်ဆက်ပေးပါမယ်။</p>
          </div>
          <Link href="/register" className="btn-mint shrink-0 px-7 py-3.5 text-base">အခုပဲ စတင်ပါ</Link>
        </div>
      </section>
    </div>
  );
}
