"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { apiFetch } from "@/lib/api";

export default function DriverRegisterPage() {
  return (
    <AuthGuard>
      <DriverRegisterInner />
    </AuthGuard>
  );
}

function DriverRegisterInner() {
  const router = useRouter();
  const [licenseNumber, setLicenseNumber] = useState("");
  const [nrcNumber, setNrcNumber] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carPlate, setCarPlate] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carYear, setCarYear] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/api/driver/register", {
        method: "POST",
        body: JSON.stringify({
          licenseNumber,
          nrcNumber,
          carModel,
          carPlate,
          carColor,
          carYear: Number(carYear),
        }),
      });
      router.push("/offer-ride");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap max-w-xl">
      <div className="card">
        <h1 className="page-title">Register as a driver</h1>
        <p className="section-sub">Add your licence, NRC and car details. Your account becomes a driver account and you can start offering rides.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="licenseNumber" className="label">Driving licence number</label>
              <input id="licenseNumber" className="input" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="Licence no." required />
            </div>
            <div>
              <label htmlFor="nrcNumber" className="label">NRC number</label>
              <input id="nrcNumber" className="input" value={nrcNumber} onChange={(e) => setNrcNumber(e.target.value)} placeholder="e.g. 12/PaKaNa(N)123456" required />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="carModel" className="label">Car model</label>
              <input id="carModel" className="input" value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder="e.g. Toyota Corolla" required />
            </div>
            <div>
              <label htmlFor="carPlate" className="label">Plate number</label>
              <input id="carPlate" className="input" value={carPlate} onChange={(e) => setCarPlate(e.target.value)} placeholder="e.g. YGN 1A-1234" required />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="carColor" className="label">Car colour</label>
              <input id="carColor" className="input" value={carColor} onChange={(e) => setCarColor(e.target.value)} placeholder="e.g. White" required />
            </div>
            <div>
              <label htmlFor="carYear" className="label">Car year</label>
              <input id="carYear" className="input" type="number" min={1990} max={2027} value={carYear} onChange={(e) => setCarYear(e.target.value)} placeholder="e.g. 2019" required />
            </div>
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Registering…" : "Register as driver"}</button>
        </form>
      </div>
    </div>
  );
}
