"use client";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  income: number;
  creditScore: number;
  idleBalance: number;
  existingEmiRatio: number;
  existingProducts: string[];
  demographics: Record<string, unknown> | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerTableProps {
  customers: Customer[];
  loading: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCreditScoreBadge(score: number) {
  if (score >= 800) return "bg-emerald-500/12 text-emerald-400 border border-emerald-500/20";
  if (score >= 700) return "bg-blue-500/12 text-blue-400 border border-blue-500/20";
  if (score >= 600) return "bg-amber-500/12 text-amber-400 border border-amber-500/20";
  return "bg-red-500/12 text-red-400 border border-red-500/20";
}

function ProductPill({ product }: { product: string }) {
  return (
    <span className="inline-flex px-[0.55rem] py-[0.2rem] bg-[#6366f1]/[0.08] border border-[#6366f1]/[0.15] rounded-md text-[0.7rem] font-medium text-[#a5b4fc] whitespace-nowrap capitalize">
      {product.replace(/_/g, " ")}
    </span>
  );
}

export default function CustomerTable({ customers, loading }: CustomerTableProps) {
  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto flex flex-col items-center justify-center py-16 px-8 text-[#64748b] gap-4">
        <div className="w-8 h-8 border-[3px] border-[#6366f1]/15 border-t-[#6366f1] rounded-full animate-spin" />
        <p>Loading customers...</p>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto flex flex-col items-center justify-center py-20 px-8 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#334155] mb-4">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        <p className="text-[1.1rem] font-semibold text-[#94a3b8] mb-[0.3rem] mt-0">No customers found</p>
        <p className="text-[0.85rem] text-[#475569] m-0">Try adjusting your search or add a new customer</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-x-auto md:rounded-2xl md:overflow-hidden custom-scrollbar shadow-[0_4px_24px_rgba(0,0,0,0.15)] backdrop-blur-xl">
      <table className="w-full border-collapse text-[0.85rem] min-w-[900px] md:min-w-full" id="customer-table">
        <thead className="bg-white/[0.03] border-b border-white/[0.06]">
          <tr>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Customer</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Contact</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Income</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Credit Score</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Idle Balance</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">EMI Ratio</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Products</th>
            <th className="px-4 py-[0.85rem] text-left font-semibold text-[0.75rem] uppercase tracking-[0.06em] text-[#64748b] whitespace-nowrap">Last Contacted</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer, idx) => (
            <tr key={customer.id} className="transition-colors duration-150 hover:bg-[#6366f1]/[0.04] opacity-0 animate-fade-slide-in" style={{ animationDelay: `${idx * 30}ms` }}>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#6366f1] to-[#a78bfa] flex items-center justify-center font-bold text-[0.85rem] text-white flex-shrink-0 shadow-[0_2px_8px_rgba(99,102,241,0.2)]">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-[#f1f5f9] whitespace-nowrap">{customer.name}</span>
                </div>
              </td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03]">
                <div className="flex flex-col gap-[0.15rem]">
                  {customer.email && <span className="text-[#94a3b8] text-[0.8rem]">{customer.email}</span>}
                  {customer.phone && <span className="text-[#64748b] text-[0.75rem]">{customer.phone}</span>}
                  {!customer.email && !customer.phone && <span className="text-[#475569]">—</span>}
                </div>
              </td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03] font-mono">{formatCurrency(customer.income)}</td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03]">
                <span className={`inline-flex px-[0.65rem] py-1 rounded-lg font-bold text-[0.8rem] font-mono ${getCreditScoreBadge(customer.creditScore)}`}>
                  {customer.creditScore}
                </span>
              </td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03] font-mono">{formatCurrency(customer.idleBalance)}</td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03]">
                <span className={`font-mono text-[#94a3b8] ${customer.existingEmiRatio > 0.5 ? "text-red-400 font-semibold" : ""}`}>
                  {(customer.existingEmiRatio * 100).toFixed(0)}%
                </span>
              </td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03]">
                <div className="flex flex-wrap gap-[0.3rem]">
                  {customer.existingProducts.length > 0
                    ? customer.existingProducts.map((p) => (
                        <ProductPill key={p} product={p} />
                      ))
                    : <span className="text-[#475569]">None</span>}
                </div>
              </td>
              <td className="px-4 py-[0.85rem] align-middle border-b border-white/[0.03] text-[#475569]">{formatDate(customer.lastContactedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
