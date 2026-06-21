"use client";

import { useState, useEffect, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import CustomerTable, { type Customer } from "@/components/CustomerTable";
import Pagination from "@/components/Pagination";
import AddCustomerModal from "@/components/AddCustomerModal";
import AgentChatModal from "@/components/AgentChatModal";

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  const fetchCustomers = useCallback(async (query: string, page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: query,
        page: String(page),
        limit: "10",
      });
      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      setCustomers(data.customers || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
    } catch (err) {
      console.error("Failed to fetch customers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when search/page changes
  useEffect(() => {
    fetchCustomers(search, pagination.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);
      fetchCustomers(query, 1);
    },
    [fetchCustomers]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      fetchCustomers(search, newPage);
    },
    [fetchCustomers, search]
  );

  const handleCustomerAdded = useCallback(() => {
    fetchCustomers(search, 1);
  }, [fetchCustomers, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c0e14] via-[#111827] to-[#0f172a] px-3 pb-8 md:px-6 md:pb-12 pt-0 font-sans text-[#e2e8f0]">
      {/* Header */}
      <header className="pt-8 pb-6 border-b border-white/[0.06] mb-6">
        <div className="max-w-[1400px] mx-auto flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white shadow-[0_4px_14px_rgba(99,102,241,0.3)]">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <h1 className="text-[1.75rem] font-bold tracking-tight text-[#f8fafc] m-0 leading-tight">Customers</h1>
              <p className="text-sm text-[#94a3b8] mt-[0.15rem] m-0">
                Manage your customer relationships
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              id="talk-agent-btn"
              className="inline-flex items-center gap-2 px-5 py-[0.65rem] bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.15] text-[#e2e8f0] rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:-translate-y-[0.5px] active:translate-y-0"
              onClick={() => setAgentModalOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#8b5cf6]">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Talk to Agent
            </button>
            <button
              id="add-customer-btn"
              className="inline-flex items-center gap-2 px-5 py-[0.65rem] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white border-0 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 shadow-[0_2px_10px_rgba(99,102,241,0.25)] hover:not-disabled:-translate-y-[1px] hover:not-disabled:shadow-[0_4px_20px_rgba(99,102,241,0.4)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => setModalOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Customer
            </button>
          </div>
        </div>
      </header>

      {/* Search + Stats */}
      <div className="max-w-[1400px] mx-auto mb-5 flex flex-col items-stretch gap-4 md:flex-row md:items-center flex-wrap">
        <SearchBar onSearch={handleSearch} debounceMs={400} />
        <div className="md:ml-auto ml-0">
          <span className="inline-flex items-center gap-[0.35rem] px-3.5 py-[0.45rem] bg-white/[0.04] border border-white/[0.08] rounded-full text-[0.8rem] text-[#94a3b8]">
            <strong className="text-[#e2e8f0] font-bold">{pagination.total}</strong> customers
          </span>
        </div>
      </div>

      {/* Table */}
      <CustomerTable customers={customers} loading={loading} />

      {/* Pagination */}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={handlePageChange}
      />

      {/* Modals */}
      <AddCustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleCustomerAdded}
      />

      <AgentChatModal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
      />
    </div>
  );
}
