import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "../lib/format";
import { cx } from "./ui";

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav className="flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Pagination">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing <span className="font-medium text-slate-700 dark:text-slate-200">{formatNumber(from)}–{formatNumber(to)}</span> of{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">{formatNumber(total)}</span> jobs
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button
            className={cx(btn, "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={cx(
                  btn,
                  p === page
                    ? "bg-brand-600 text-white dark:bg-brand-500"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            className={cx(btn, "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </nav>
  );
}
