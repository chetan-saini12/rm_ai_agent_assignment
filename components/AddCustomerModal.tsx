"use client";

import { useState } from "react";

interface AddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRODUCT_OPTIONS = [
  "savings_account",
  "current_account",
  "fixed_deposit",
  "recurring_deposit",
  "personal_loan",
  "home_loan",
  "car_loan",
  "credit_card",
  "mutual_fund",
  "insurance",
  "demat_account",
];

export default function AddCustomerModal({ open, onClose, onSuccess }: AddCustomerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    income: "",
    creditScore: "",
    idleBalance: "",
    existingEmiRatio: "",
    existingProducts: [] as string[],
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const toggleProduct = (product: string) => {
    setForm((prev) => ({
      ...prev,
      existingProducts: prev.existingProducts.includes(product)
        ? prev.existingProducts.filter((p) => p !== product)
        : [...prev.existingProducts, product],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          income: Number(form.income),
          creditScore: Number(form.creditScore),
          idleBalance: Number(form.idleBalance) || 0,
          existingEmiRatio: Number(form.existingEmiRatio) || 0,
          existingProducts: form.existingProducts,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      // Reset form and close
      setForm({
        name: "",
        email: "",
        phone: "",
        income: "",
        creditScore: "",
        idleBalance: "",
        existingEmiRatio: "",
        existingProducts: [],
      });
      onSuccess();
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[6px] flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-[640px] max-h-[95vh] md:max-h-[90vh] overflow-y-auto bg-gradient-to-br from-[#1e1b3a] to-[#1a1d2e] border border-white/[0.08] rounded-[20px] shadow-[0_24px_80px_rgba(0,0,0,0.5),_0_0_0_1px_rgba(99,102,241,0.08)] animate-slide-up custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-[1.15rem] font-bold text-[#f1f5f9] m-0">Add New Customer</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-white/[0.05] border-none rounded-lg text-[#64748b] cursor-pointer transition-all duration-150 hover:bg-white/10 hover:text-[#e2e8f0]" aria-label="Close modal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mx-6 mt-4 px-4 py-[0.7rem] bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[0.85rem]">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="mb-6 last:mb-0">
            <h3 className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#6366f1] mb-3 mt-0">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[0.85rem]">
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-name" className="text-[0.78rem] font-medium text-[#94a3b8]">Name *</label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Rajesh Sharma"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-email" className="text-[0.78rem] font-medium text-[#94a3b8]">Email</label>
                <input
                  id="customer-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="rajesh@example.com"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-phone" className="text-[0.78rem] font-medium text-[#94a3b8]">Phone</label>
                <input
                  id="customer-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
            </div>
          </div>

          <div className="mb-6 last:mb-0">
            <h3 className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#6366f1] mb-3 mt-0">Financial Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[0.85rem]">
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-income" className="text-[0.78rem] font-medium text-[#94a3b8]">Monthly Income (₹) *</label>
                <input
                  id="customer-income"
                  type="number"
                  required
                  min="0"
                  value={form.income}
                  onChange={(e) => update("income", e.target.value)}
                  placeholder="85000"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-credit-score" className="text-[0.78rem] font-medium text-[#94a3b8]">Credit Score *</label>
                <input
                  id="customer-credit-score"
                  type="number"
                  required
                  min="300"
                  max="900"
                  value={form.creditScore}
                  onChange={(e) => update("creditScore", e.target.value)}
                  placeholder="750"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-idle-balance" className="text-[0.78rem] font-medium text-[#94a3b8]">Idle Balance (₹)</label>
                <input
                  id="customer-idle-balance"
                  type="number"
                  min="0"
                  value={form.idleBalance}
                  onChange={(e) => update("idleBalance", e.target.value)}
                  placeholder="150000"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <label htmlFor="customer-emi-ratio" className="text-[0.78rem] font-medium text-[#94a3b8]">EMI Ratio (0-1)</label>
                <input
                  id="customer-emi-ratio"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={form.existingEmiRatio}
                  onChange={(e) => update("existingEmiRatio", e.target.value)}
                  placeholder="0.35"
                  className="px-[0.85rem] py-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded-lg text-[#e2e8f0] text-[0.85rem] outline-none transition-all duration-200 placeholder:text-[#334155] focus:border-[#6366f1]/50 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
            </div>
          </div>

          <div className="mb-6 last:mb-0">
            <h3 className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-[#6366f1] mb-3 mt-0">Existing Products</h3>
            <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {PRODUCT_OPTIONS.map((product) => (
                <label
                  key={product}
                  className={`flex items-center gap-2 px-[0.7rem] py-2 bg-white/[0.03] border border-white/[0.06] rounded-lg cursor-pointer text-[0.78rem] text-[#94a3b8] capitalize transition-all duration-150 hover:bg-white/[0.05] hover:border-white/10 ${
                    form.existingProducts.includes(product) ? "bg-[#6366f1]/10 border-[#6366f1]/30 text-[#a5b4fc]" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.existingProducts.includes(product)}
                    onChange={() => toggleProduct(product)}
                    className="w-3.5 h-3.5 accent-[#6366f1]"
                  />
                  <span>{product.replace(/_/g, " ")}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-5 mt-4 border-t border-white/[0.06]">
            <button type="button" onClick={onClose} className="inline-flex items-center gap-2 px-5 py-[0.65rem] bg-white/5 text-[#94a3b8] border border-white/10 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 hover:not-disabled:bg-white/[0.08] hover:not-disabled:text-[#e2e8f0] hover:not-disabled:border-white/15" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="inline-flex items-center gap-2 px-5 py-[0.65rem] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white border-0 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 shadow-[0_2px_10px_rgba(99,102,241,0.25)] hover:not-disabled:-translate-y-[1px] hover:not-disabled:shadow-[0_4px_20px_rgba(99,102,241,0.4)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed" disabled={loading} id="add-customer-submit">
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                "Add Customer"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
