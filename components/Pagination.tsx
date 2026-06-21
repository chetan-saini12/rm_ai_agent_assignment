"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build visible page numbers with ellipses
  const pages: (number | "...")[] = [];
  const delta = 1;

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= page - delta && i <= page + delta)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto mt-5 flex flex-col items-center gap-4 md:flex-row md:justify-between flex-wrap">
      <span className="text-[0.8rem] text-[#64748b]">
        Showing page <strong className="text-[#94a3b8] font-bold">{page}</strong> of <strong className="text-[#94a3b8] font-bold">{totalPages}</strong>
        {" "}({total} total)
      </span>

      <div className="flex items-center gap-[0.35rem]">
        <button
          id="pagination-prev"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-[0.35rem] px-[0.85rem] py-[0.45rem] bg-white/[0.04] border border-white/[0.08] text-[#94a3b8] rounded-lg text-[0.8rem] cursor-pointer transition-all duration-150 hover:not-disabled:bg-white/[0.08] hover:not-disabled:text-[#e2e8f0] disabled:opacity-35 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Prev
        </button>

        {pages.map((p, idx) =>
          p === "..." ? (
            <span key={`ellipsis-${idx}`} className="w-[34px] inline-flex items-center justify-center text-[#475569] text-[0.85rem]">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-[34px] h-[34px] inline-flex items-center justify-center rounded-lg text-[0.8rem] font-medium cursor-pointer transition-all duration-150 border border-transparent hover:bg-white/[0.06] hover:text-[#e2e8f0] ${p === page ? "bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white font-bold shadow-[0_2px_8px_rgba(99,102,241,0.25)] border-transparent" : "bg-transparent text-[#64748b]"}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          id="pagination-next"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-[0.35rem] px-[0.85rem] py-[0.45rem] bg-white/[0.04] border border-white/[0.08] text-[#94a3b8] rounded-lg text-[0.8rem] cursor-pointer transition-all duration-150 hover:not-disabled:bg-white/[0.08] hover:not-disabled:text-[#e2e8f0] disabled:opacity-35 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          Next
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
