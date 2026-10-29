import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Inbox, Loader2, RotateCw } from "lucide-react";
import { copyText, useElapsed } from "../lib/hooks";
import { initials } from "../lib/format";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------- Button --------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantCls: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/60 dark:bg-brand-500 dark:hover:bg-brand-600",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
  danger:
    "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40",
};

const sizeCls: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60",
        variantCls[variant],
        sizeCls[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

type Tone = "slate" | "brand" | "green" | "amber" | "rose" | "teal" | "violet" | "sky";

const toneCls: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  brand: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  rose: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  teal: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30",
  violet: "bg-violet-600 text-white ring-violet-600 dark:bg-violet-500 dark:ring-violet-500",
  sky: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
};

export function Badge({
  tone = "slate",
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset whitespace-nowrap",
        toneCls[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* --------------------------------- Tooltip --------------------------------- */

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-56 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 dark:bg-slate-700"
      >
        {label}
      </span>
    </span>
  );
}

/* --------------------------------- Spinner --------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-brand-500", className ?? "size-5")} />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-slate-500 dark:text-slate-400">
      <Spinner className="size-6" />
      {label}
    </div>
  );
}

/** Loading panel for slow (AI / network-bound) operations with an elapsed timer. */
export function SlowLoader({ title, hint }: { title: string; hint: string }) {
  const secs = useElapsed(true);
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
        <span className="relative flex size-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/15">
          <Loader2 className="size-6 animate-spin text-brand-600 dark:text-brand-400" />
        </span>
      </div>
      <p className="font-medium text-slate-800 dark:text-slate-100">{title}</p>
      <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      <p className="text-xs tabular-nums text-slate-400">{secs}s elapsed</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800", className)} />;
}

/* ------------------------------ Error / Empty ------------------------------ */

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  compact = false,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 text-sm dark:border-rose-900/50 dark:bg-rose-950/30",
        compact ? "p-3" : "p-4",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rose-800 dark:text-rose-300">{title}</p>
        <p className="mt-0.5 break-words text-rose-700/90 dark:text-rose-300/80">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
      <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ------------------------------- CopyButton -------------------------------- */

export function CopyButton({
  text,
  label,
  className,
  size = "sm",
}: {
  text: string;
  label?: string;
  className?: string;
  size?: Size;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={label ? "secondary" : "ghost"}
      className={cx(!label && "w-8 px-0", className)}
      aria-label={label ?? "Copy to clipboard"}
      title={copied ? "Copied" : "Copy to clipboard"}
      icon={copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }
      }}
    >
      {label && (copied ? "Copied" : label)}
    </Button>
  );
}

/* --------------------------------- Switch ---------------------------------- */

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-50",
        checked ? "bg-brand-600 dark:bg-brand-500" : "bg-slate-300 dark:bg-slate-700",
      )}
    >
      <span
        className={cx(
          "inline-block size-4 rounded-full bg-white shadow transition",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ------------------------------- CompanyLogo ------------------------------- */

const LOGO_COLORS = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
];

export function CompanyLogo({
  name,
  url,
  size = "md",
}: {
  name: string;
  url: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const dim = size === "lg" ? "size-16 text-xl rounded-2xl" : size === "sm" ? "size-8 text-xs rounded-lg" : "size-11 text-sm rounded-xl";
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx(dim, "shrink-0 border border-slate-200 bg-white object-contain p-1 dark:border-slate-700")}
      />
    );
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={cx(dim, "flex shrink-0 items-center justify-center font-semibold", LOGO_COLORS[h % LOGO_COLORS.length])}>
      {initials(name)}
    </span>
  );
}

/* ------------------------------- ScoreRing --------------------------------- */

export function scoreTone(score: number): { stroke: string; text: string; label: string } {
  if (score >= 70) return { stroke: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Strong match" };
  if (score >= 45) return { stroke: "stroke-brand-500", text: "text-brand-600 dark:text-brand-400", label: "Good match" };
  return { stroke: "stroke-slate-400", text: "text-slate-500 dark:text-slate-400", label: "Weak match" };
}

export function ScoreRing({ score, size = 44, title }: { score: number; size?: number; title?: string }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(s);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={title ?? `${tone.label} · score ${s}/100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={4} className="fill-none stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - s / 100)}
          className={cx("fill-none transition-[stroke-dashoffset] duration-500", tone.stroke)}
        />
      </svg>
      <span className={cx("absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums", tone.text)}>{s}</span>
    </div>
  );
}

/* ---------------------------------- Tabs ----------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-1 border-b border-slate-200 dark:border-slate-800", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium whitespace-nowrap transition sm:px-3",
            value === t.id
              ? "border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          {t.icon && <span className="hidden sm:inline-flex">{t.icon}</span>}
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ SectionHeading ----------------------------- */

export function SectionTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {icon && <span className="text-brand-600 dark:text-brand-400">{icon}</span>}
        {children}
      </h3>
      {action}
    </div>
  );
}

export function BulletList({ items, marker = "dot" }: { items: string[]; marker?: "dot" | "check" | "warn" }) {
  if (!items.length) return <p className="text-sm text-slate-400">—</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {marker === "check" ? (
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          ) : marker === "warn" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          ) : (
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
          )}
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function Chips({ items, tone = "slate" }: { items: string[]; tone?: Tone }) {
  if (!items.length) return <p className="text-sm text-slate-400">—</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={`${it}-${i}`}
          className={cx("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset", toneCls[tone])}
        >
          {it}
        </span>
      ))}
    </div>
  );
}
