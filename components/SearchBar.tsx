"use client";

import { useState, useEffect, useRef } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export default function SearchBar({ onSearch, debounceMs = 400 }: SearchBarProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      onSearch(value);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, onSearch]);

  return (
    <div className="relative flex-1 min-w-[260px] max-w-full md:max-w-[480px]">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        id="customer-search"
        type="text"
        placeholder="Search by name, email, or phone..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full pl-11 pr-10 py-[0.7rem] bg-white/[0.04] border border-white/[0.08] rounded-xl text-[#e2e8f0] text-sm outline-none transition-all duration-200 placeholder:text-[#475569] focus:border-[#6366f1]/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 bg-transparent border-none text-[#64748b] cursor-pointer rounded-md flex items-center justify-center transition-colors duration-150 hover:text-[#e2e8f0]"
          aria-label="Clear search"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
