import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CalendarClock,
  CircleCheckBig,
  Eye,
  EyeOff,
  Globe2,
  IndianRupee,
  MapPin,
  Send,
  Sparkles,
} from "lucide-react";
import type { Job, JobStatus } from "../api";
import { sourceLabel, timeAgo, useSourceLabels } from "../lib/format";
import { useNow } from "../lib/hooks";
import { Badge, CompanyLogo, ScoreRing, Tooltip, cx } from "./ui";
import { useSetJobStatus } from "./jobActions";

export function LocationBadges({ job }: { job: Job }) {
  return (
    <>
      {job.location_tag === "pune" ? (
        <Badge tone="violet" icon={<MapPin className="size-3" />} title={job.location}>
          Pune
        </Badge>
      ) : null}
      {job.location && !(job.location_tag === "pune" && /^\s*pune\s*$/i.test(job.location)) && (
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {job.location_tag !== "pune" && <MapPin className="size-3 shrink-0" />}
          <span className="truncate">{job.location}</span>
        </span>
      )}
      {job.remote && (
        <Badge tone="teal" icon={<Globe2 className="size-3" />}>
          Remote
        </Badge>
      )}
    </>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  if (status === "saved") return <Badge tone="brand" icon={<BookmarkCheck className="size-3" />}>Saved</Badge>;
  if (status === "applied") return <Badge tone="green" icon={<CircleCheckBig className="size-3" />}>Applied</Badge>;
  if (status === "hidden") return <Badge tone="slate" icon={<EyeOff className="size-3" />}>Hidden</Badge>;
  return null;
}

export function JobQuickActions({ job, size = "sm" }: { job: Job; size?: "sm" | "md" }) {
  const setStatus = useSetJobStatus();
  const btn = cx(
    "inline-flex items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
    size === "sm" ? "size-8" : "size-9",
  );
  const idle =
    "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-100";
  const icon = size === "sm" ? "size-4" : "size-[18px]";

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Tooltip label={job.status === "saved" ? "Remove from saved" : "Save"}>
        <button
          aria-label={job.status === "saved" ? "Remove from saved" : "Save job"}
          aria-pressed={job.status === "saved"}
          className={cx(
            btn,
            job.status === "saved"
              ? "border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300"
              : idle,
          )}
          onClick={() => setStatus(job, job.status === "saved" ? null : "saved")}
        >
          {job.status === "saved" ? <BookmarkCheck className={icon} /> : <Bookmark className={icon} />}
        </button>
      </Tooltip>
      <Tooltip label={job.status === "applied" ? "Unmark applied" : "Mark as applied"}>
        <button
          aria-label={job.status === "applied" ? "Unmark applied" : "Mark as applied"}
          aria-pressed={job.status === "applied"}
          className={cx(
            btn,
            job.status === "applied"
              ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
              : idle,
          )}
          onClick={() => setStatus(job, job.status === "applied" ? null : "applied")}
        >
          {job.status === "applied" ? <CircleCheckBig className={icon} /> : <Send className={icon} />}
        </button>
      </Tooltip>
      <Tooltip label={job.status === "hidden" ? "Unhide" : "Hide"}>
        <button
          aria-label={job.status === "hidden" ? "Unhide job" : "Hide job"}
          aria-pressed={job.status === "hidden"}
          className={cx(
            btn,
            job.status === "hidden"
              ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              : idle,
          )}
          onClick={() => setStatus(job, job.status === "hidden" ? null : "hidden")}
        >
          {job.status === "hidden" ? <Eye className={icon} /> : <EyeOff className={icon} />}
        </button>
      </Tooltip>
    </div>
  );
}

export function SourceChips({ job, max = 4 }: { job: Job; max?: number }) {
  useSourceLabels();
  const sources = job.sources.length ? job.sources : [{ source: "direct", url: job.url }];
  const shown = sources.slice(0, max);
  const rest = sources.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {shown.map((s, i) => (
        <a
          key={`${s.source}-${i}`}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`View on ${sourceLabel(s.source)}`}
          className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-brand-500/50 dark:hover:text-brand-300"
        >
          {sourceLabel(s.source)}
        </a>
      ))}
      {rest > 0 && <span className="text-[11px] text-slate-400">+{rest} more</span>}
    </div>
  );
}

export function PostedLabel({ job }: { job: Job }) {
  const now = useNow();
  const posted = job.posted_at ? timeAgo(job.posted_at, now) : "";
  const label = posted ? `Posted ${posted}` : `Found ${timeAgo(job.first_seen_at, now)}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      <CalendarClock className="size-3" />
      {label}
    </span>
  );
}

export function JobCard({ job, onOpen, active }: { job: Job; onOpen: (job: Job) => void; active?: boolean }) {
  const meta: { icon: ReactNode; text: string }[] = [];
  if (job.salary) meta.push({ icon: <IndianRupee className="size-3" />, text: job.salary });
  if (job.experience) meta.push({ icon: <Sparkles className="size-3" />, text: job.experience });
  if (job.employment_type) meta.push({ icon: <Briefcase className="size-3" />, text: job.employment_type });

  return (
    <article
      onClick={() => onOpen(job)}
      className={cx(
        "group card relative cursor-pointer p-4 transition hover:border-brand-300 hover:shadow-md sm:p-5 dark:hover:border-brand-500/50",
        active && "border-brand-400 ring-2 ring-brand-500/20 dark:border-brand-500/60",
        job.status === "hidden" && "opacity-70",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <CompanyLogo name={job.company.name} url={job.company.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
                <button
                  className="text-left hover:text-brand-700 focus-visible:outline-none focus-visible:underline dark:hover:text-brand-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(job);
                  }}
                >
                  {job.title}
                </button>
              </h3>
              <Link
                to={`/companies/${job.company.id}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 inline-block text-sm font-medium text-slate-600 hover:text-brand-700 hover:underline dark:text-slate-300 dark:hover:text-brand-300"
              >
                {job.company.name}
              </Link>
            </div>
            <ScoreRing score={job.score} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {job.is_new && <Badge tone="green">NEW</Badge>}
            <StatusBadge status={job.status} />
            <LocationBadges job={job} />
            <span className="hidden text-slate-300 sm:inline dark:text-slate-700">•</span>
            <PostedLabel job={job} />
          </div>

          {meta.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {meta.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">{m.icon}</span>
                  {m.text}
                </span>
              ))}
            </div>
          )}

          {job.snippet && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{job.snippet}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <SourceChips job={job} />
            <JobQuickActions job={job} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex gap-4">
        <div className="size-11 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="flex-1 space-y-2.5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
}
