import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Globe2,
  Layers,
  Loader2,
  MapPin,
  Radar,
  Search,
  SearchX,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { ApiError, api, errorMessage, type Job, type JobQuery, type Stats, type Tag } from "../api";
import { formatDateTime, formatNumber, sourceLabel, timeAgo, timeUntil, useSourceLabels } from "../lib/format";
import { useDebouncedCallback, useElapsed, useNow } from "../lib/hooks";
import { useJobUpdated } from "../lib/events";
import { JobCard, JobCardSkeleton } from "../components/JobCard";
import { Pagination } from "../components/Pagination";
import { useOpenJob } from "../components/jobActions";
import { useToast } from "../components/Toast";
import { Button, EmptyState, ErrorState, Skeleton, Switch, cx } from "../components/ui";

const PAGE_SIZE = 30;
const POLL_MS = 4000;

type StatusFilter = "saved" | "applied" | "hidden" | "";
type SortKey = "score" | "date";

interface Filters {
  q: string;
  tag: Tag | "";
  source: string;
  newOnly: boolean;
  days: number | null;
  status: StatusFilter;
  sort: SortKey;
  page: number;
}

const DAY_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Past 24 hours" },
  { value: "3", label: "Past 3 days" },
  { value: "7", label: "Past week" },
  { value: "30", label: "Past month" },
];

function readFilters(p: URLSearchParams): Filters {
  const tag = p.get("tag");
  const status = p.get("status");
  const days = Number(p.get("days"));
  const page = Number(p.get("page"));
  return {
    q: p.get("q") ?? "",
    tag: tag === "pune" || tag === "india" || tag === "remote" ? tag : "",
    source: p.get("source") ?? "",
    newOnly: p.get("new") === "1",
    days: [1, 3, 7, 30].includes(days) ? days : null,
    status: status === "saved" || status === "applied" || status === "hidden" ? status : "",
    sort: p.get("sort") === "date" ? "date" : "score",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function toQuery(f: Filters): JobQuery {
  return {
    q: f.q.trim() || undefined,
    tag: f.tag || undefined,
    source: f.source || undefined,
    new_only: f.newOnly || undefined,
    days: f.days ?? undefined,
    status: f.status || undefined,
    sort: f.sort,
    page: f.page,
    page_size: PAGE_SIZE,
  };
}

/* ------------------------------- Stat tiles -------------------------------- */

function StatTile({
  label,
  value,
  icon,
  accent,
  active,
  onClick,
  hint,
}: {
  label: string;
  value: number | undefined;
  icon: ReactNode;
  accent: string;
  active?: boolean;
  onClick?: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cx(
        "card group flex items-center gap-3 p-3 text-left transition first:col-span-2 hover:border-brand-300 hover:shadow-md sm:p-4 sm:first:col-span-1 dark:hover:border-brand-500/50",
        active && "border-brand-400 ring-2 ring-brand-500/20 dark:border-brand-500/60",
      )}
    >
      <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10", accent)}>{icon}</span>
      <div className="min-w-0">
        {value === undefined ? (
          <Skeleton className="h-7 w-14" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">{formatNumber(value)}</p>
        )}
        <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </button>
  );
}

function ScanPanel({
  stats,
  starting,
  onScan,
}: {
  stats: Stats | null;
  starting: boolean;
  onScan: () => void;
}) {
  const now = useNow(30_000);
  const running = !!stats?.scan_running;
  const elapsed = useElapsed(running);
  const last = stats?.last_scan ?? null;

  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cx(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            running
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
              : last?.status === "failed"
                ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
          )}
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : last?.status === "failed" ? (
            <XCircle className="size-4" />
          ) : (
            <Radar className="size-4" />
          )}
        </span>
        <div className="min-w-0 text-sm">
          {!stats ? (
            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-36" />
            </div>
          ) : running ? (
            <>
              <p className="font-semibold text-slate-900 dark:text-white">Scanning job sources…</p>
              <p className="text-slate-500 dark:text-slate-400">
                Running for {elapsed}s · results appear automatically when it finishes
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-900 dark:text-white">
                {last ? (
                  <>
                    Last scan {timeAgo(last.finished_at ?? last.started_at, now)}
                    <span
                      className={cx(
                        "ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-[11px] font-medium",
                        last.status === "done"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : last.status === "failed"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      )}
                    >
                      {last.status === "done" ? <CheckCircle2 className="size-3" /> : last.status === "failed" ? <XCircle className="size-3" /> : null}
                      {last.status === "done" ? "Completed" : last.status === "failed" ? "Failed" : "Running"}
                    </span>
                  </>
                ) : (
                  "No scans yet"
                )}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                {last && (
                  <>
                    {formatDateTime(last.started_at)} · {formatNumber(last.total_found)} found · {formatNumber(last.new_jobs)} new
                    <br className="sm:hidden" />
                    <span className="hidden sm:inline"> · </span>
                  </>
                )}
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {stats.next_scan_at
                    ? `Next scan ${timeUntil(stats.next_scan_at, now)} (${formatDateTime(stats.next_scan_at)})`
                    : "No scan scheduled"}
                </span>
              </p>
            </>
          )}
        </div>
      </div>
      <Button
        variant="primary"
        onClick={onScan}
        loading={starting || running}
        disabled={!stats}
        icon={<Radar className="size-4" />}
        className="sm:self-center"
      >
        {running ? "Scanning…" : "Scan now"}
      </Button>
    </div>
  );
}

/* --------------------------------- Filters --------------------------------- */

function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx("input w-auto cursor-pointer pr-8", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------- Page ----------------------------------- */

export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const openJob = useOpenJob();
  const toast = useToast();
  const activeJobId = Number(params.get("job")) || null;
  const labelsVersion = useSourceLabels();

  /* ---- stats + scan ---- */
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [awaitingRun, setAwaitingRun] = useState<{ id: number; since: number } | null>(null);
  const wasRunning = useRef(false);

  const loadStats = useCallback(async () => {
    try {
      const s = await api.getStats();
      setStats(s);
      setStatsError(null);
      return s;
    } catch (err) {
      setStatsError(errorMessage(err));
      return null;
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  /* ---- jobs ---- */
  const [items, setItems] = useState<Job[] | null>(null);
  const [total, setTotal] = useState(0);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const reqId = useRef(0);
  const queryKey = JSON.stringify(toQuery(filters));

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setJobsError(null);
    api
      .listJobs(JSON.parse(queryKey) as JobQuery)
      .then((res) => {
        if (id !== reqId.current) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (id === reqId.current) setJobsError(errorMessage(err));
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [queryKey, reloadToken]);

  const refreshAll = useCallback(() => {
    setReloadToken((t) => t + 1);
    void loadStats();
  }, [loadStats]);

  useJobUpdated((u) => {
    setItems((xs) => (xs ? xs.map((j) => (j.id === u.id ? { ...j, ...u } : j)) : xs));
  });

  /* ---- scan polling ---- */
  const polling = !!stats?.scan_running || awaitingRun !== null;

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void loadStats(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [polling, loadStats]);

  useEffect(() => {
    if (!stats) return;
    if (awaitingRun !== null && !stats.scan_running) {
      const last = stats.last_scan;
      const finished = last && last.id >= awaitingRun.id && last.status !== "running";
      // Safety valve: if the backend never reports the run as running, stop waiting after 20s.
      if (finished || Date.now() - awaitingRun.since > 20_000) {
        setAwaitingRun(null);
        return;
      }
    }
    const running = stats.scan_running || awaitingRun !== null;
    if (wasRunning.current && !running) {
      setReloadToken((t) => t + 1);
      const last = stats.last_scan;
      if (last?.status === "failed") toast.error("The scan failed. See Settings → Scan history for details.");
      else if (last) toast.success(`Scan complete — ${formatNumber(last.new_jobs)} new of ${formatNumber(last.total_found)} jobs found`);
    }
    wasRunning.current = running;
  }, [stats, awaitingRun, toast]);

  const startScan = async () => {
    setStarting(true);
    try {
      const { run_id } = await api.startScan();
      setAwaitingRun({ id: run_id, since: Date.now() });
      wasRunning.current = true;
      setStats((s) => (s ? { ...s, scan_running: true } : s));
      toast.show("Scan started — fetching the latest AI/ML openings");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.show("A scan is already running");
        wasRunning.current = true;
        setStats((s) => (s ? { ...s, scan_running: true } : s));
      } else {
        toast.error(`Couldn't start scan: ${errorMessage(err)}`);
      }
    } finally {
      setStarting(false);
    }
  };

  /* ---- filter helpers ---- */
  const update = useCallback(
    (patch: Partial<Filters>, opts: { keepPage?: boolean } = {}) => {
      const f = { ...filters, ...patch };
      if (!opts.keepPage) f.page = patch.page ?? 1;
      const next = new URLSearchParams();
      if (f.q.trim()) next.set("q", f.q.trim());
      if (f.tag) next.set("tag", f.tag);
      if (f.source) next.set("source", f.source);
      if (f.newOnly) next.set("new", "1");
      if (f.days) next.set("days", String(f.days));
      if (f.status) next.set("status", f.status);
      if (f.sort !== "score") next.set("sort", f.sort);
      if (f.page > 1) next.set("page", String(f.page));
      const job = params.get("job");
      if (job) next.set("job", job);
      setParams(next, { replace: patch.q !== undefined });
    },
    [filters, params, setParams],
  );

  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch(filters.q), [filters.q]);
  const pushSearch = useDebouncedCallback((q: string) => update({ q }), 350);

  const hasFilters =
    !!filters.q || !!filters.tag || !!filters.source || filters.newOnly || filters.days !== null || !!filters.status;
  const clearFilters = () => {
    setSearch("");
    update({ q: "", tag: "", source: "", newOnly: false, days: null, status: "" });
  };

  const sourceOptions = useMemo(() => {
    const entries = Object.entries(stats?.by_source ?? {}).sort((a, b) => b[1] - a[1]);
    const opts = [{ value: "", label: "All sources" }];
    for (const [name, count] of entries) opts.push({ value: name, label: `${sourceLabel(name)} (${formatNumber(count)})` });
    if (filters.source && !entries.some(([n]) => n === filters.source))
      opts.push({ value: filters.source, label: sourceLabel(filters.source) });
    return opts;
  }, [stats, filters.source, labelsVersion]);

  const visible = (items ?? []).filter((j) => filters.status === "hidden" || j.status !== "hidden");
  const sourceCount = Object.keys(stats?.by_source ?? {}).length;
  const restOfIndia = stats?.by_tag.india;

  const tagTabs: { id: Tag | ""; label: string; count?: number; icon: ReactNode }[] = [
    { id: "", label: "All", count: stats?.total_jobs, icon: <Layers className="size-3.5" /> },
    { id: "pune", label: "Pune", count: stats?.by_tag.pune, icon: <MapPin className="size-3.5" /> },
    { id: "india", label: "India", count: stats?.by_tag.india, icon: <Building2 className="size-3.5" /> },
    { id: "remote", label: "Remote", count: stats?.by_tag.remote, icon: <Globe2 className="size-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px] dark:text-white">AI &amp; ML jobs in India</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pune-first feed of AI, ML and data science openings
          {sourceCount > 0 ? ` aggregated from ${sourceCount} sources` : ""}, ranked by location, relevance and freshness.
        </p>
      </div>

      {statsError && !stats && <ErrorState title="Couldn't load dashboard stats" message={statsError} onRetry={loadStats} compact />}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Total jobs"
          value={stats?.total_jobs}
          icon={<Layers className="size-4" />}
          accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          active={hasFilters === false}
          onClick={clearFilters}
          hint="Show all jobs"
        />
        <StatTile
          label="New since last scan"
          value={stats?.new_jobs}
          icon={<Sparkles className="size-4" />}
          accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
          active={filters.newOnly}
          onClick={() => update({ newOnly: !filters.newOnly })}
          hint="Show only new jobs"
        />
        <StatTile
          label="Pune"
          value={stats?.by_tag.pune}
          icon={<MapPin className="size-4" />}
          accent="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
          active={filters.tag === "pune"}
          onClick={() => update({ tag: filters.tag === "pune" ? "" : "pune" })}
          hint="Show Pune jobs"
        />
        <StatTile
          label="Rest of India"
          value={restOfIndia}
          icon={<Building2 className="size-4" />}
          accent="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
          active={filters.tag === "india"}
          onClick={() => update({ tag: filters.tag === "india" ? "" : "india" })}
          hint="Show jobs elsewhere in India"
        />
        <StatTile
          label="Remote"
          value={stats?.by_tag.remote}
          icon={<Globe2 className="size-4" />}
          accent="bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300"
          active={filters.tag === "remote"}
          onClick={() => update({ tag: filters.tag === "remote" ? "" : "remote" })}
          hint="Show remote jobs open to India"
        />
      </div>

      <ScanPanel stats={stats} starting={starting} onScan={startScan} />

      {/* Filters */}
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Search title, company, skills…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pushSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") update({ q: search });
              }}
              aria-label="Search jobs"
            />
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 scrollbar-thin dark:bg-slate-800/70" role="tablist" aria-label="Location">
            {tagTabs.map((t) => (
              <button
                key={t.id || "all"}
                role="tab"
                aria-selected={filters.tag === t.id}
                onClick={() => update({ tag: t.id })}
                className={cx(
                  "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition",
                  filters.tag === t.id
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                )}
              >
                {t.icon}
                {t.label}
                {t.count !== undefined && <span className="hidden text-xs text-slate-400 tabular-nums sm:inline">{formatNumber(t.count)}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Select label="Source" value={filters.source} onChange={(v) => update({ source: v })} options={sourceOptions} className="w-full min-w-0 sm:w-auto" />
          <Select
            label="Posted within"
            value={filters.days ? String(filters.days) : ""}
            onChange={(v) => update({ days: v ? Number(v) : null })}
            options={DAY_OPTIONS}
            className="w-full min-w-0 sm:w-auto"
          />
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => update({ status: v as StatusFilter })}
            options={[
              { value: "", label: "All jobs" },
              { value: "saved", label: `Saved${stats ? ` (${formatNumber(stats.saved)})` : ""}` },
              { value: "applied", label: `Applied${stats ? ` (${formatNumber(stats.applied)})` : ""}` },
              { value: "hidden", label: "Hidden" },
            ]}
            className="w-full min-w-0 sm:w-auto"
          />
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 select-none dark:border-slate-700 dark:text-slate-300">
            <Switch checked={filters.newOnly} onChange={(v) => update({ newOnly: v })} label="New only" />
            New only
          </label>
          <div className="col-span-2 flex items-center justify-end gap-2 sm:ml-auto">
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={clearFilters}>
                Clear
              </Button>
            )}
            <Select
              label="Sort by"
              value={filters.sort}
              onChange={(v) => update({ sort: v as SortKey })}
              options={[
                { value: "score", label: "Best match" },
                { value: "date", label: "Newest" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <section aria-live="polite" aria-busy={loading} className="space-y-3">
        {jobsError ? (
          <ErrorState title="Couldn't load jobs" message={jobsError} onRetry={refreshAll} />
        ) : items === null ? (
          Array.from({ length: 5 }).map((_, i) => <JobCardSkeleton key={i} />)
        ) : visible.length === 0 && !loading ? (
          !hasFilters && (stats?.total_jobs ?? 0) === 0 ? (
            <EmptyState
              icon={<Radar className="size-5" />}
              title="No jobs yet — click Scan now"
              description="JobRadar scans job boards, company career pages and APIs for AI/ML openings across India. Your first scan takes a minute or two."
              action={
                <Button variant="primary" icon={<Radar className="size-4" />} loading={starting || !!stats?.scan_running} onClick={startScan}>
                  {stats?.scan_running ? "Scanning…" : "Scan now"}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<SearchX className="size-5" />}
              title={filters.status ? `No ${filters.status} jobs${filters.q ? " match your search" : ""}` : "No jobs match these filters"}
              description="Try widening the date range, switching location or clearing your search."
              action={
                <Button icon={<X className="size-4" />} onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className={cx("space-y-3 transition-opacity", loading && "pointer-events-none opacity-60")}>
              {visible.map((job) => (
                <JobCard key={job.id} job={job} active={job.id === activeJobId} onOpen={(j) => openJob(j.id)} />
              ))}
            </div>
            <div className="pt-2">
              <Pagination
                page={filters.page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={(p) => {
                  update({ page: p }, { keepPage: true });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          </>
        )}
        {loading && items !== null && visible.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Clock3 className="size-4 animate-pulse" /> Loading jobs…
          </div>
        )}
      </section>
    </div>
  );
}
