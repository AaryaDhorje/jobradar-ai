import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  CalendarClock,
  ExternalLink,
  FileText,
  Hash,
  IndianRupee,
  MapPin,
  Sparkles,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { api, errorMessage, type JobDetail } from "../api";
import { formatDate, sourceLabel, timeAgo, useSourceLabels } from "../lib/format";
import { useJobUpdated } from "../lib/events";
import { FormattedText } from "./FormattedText";
import { JobQuickActions, LocationBadges, StatusBadge } from "./JobCard";
import { ContactsTab } from "./ContactsTab";
import { ResumeTipsTab } from "./ResumeTipsTab";
import { Badge, Chips, CompanyLogo, ErrorState, ScoreRing, Skeleton, Tabs, cx } from "./ui";

type TabId = "overview" | "contacts" | "resume";

function applyLinks(job: JobDetail): { label: string; url: string }[] {
  const seen = new Set<string>();
  const out: { label: string; url: string }[] = [];
  for (const s of job.sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push({ label: sourceLabel(s.source), url: s.url });
  }
  if (!out.length && job.url) out.push({ label: "job page", url: job.url });
  return out;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex gap-4">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className={cx("h-3.5", i % 3 === 2 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium break-words text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

function Overview({ job }: { job: JobDetail }) {
  useSourceLabels();
  const links = applyLinks(job);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {links.map((l, i) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(
              "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition",
              i === 0
                ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
            )}
          >
            Apply on {l.label}
            <ExternalLink className="size-3.5" />
          </a>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
        <MetaItem icon={<MapPin className="size-3" />} label="Location" value={job.location || "—"} />
        <MetaItem icon={<IndianRupee className="size-3" />} label="Salary" value={job.salary || "Not disclosed"} />
        <MetaItem icon={<Sparkles className="size-3" />} label="Experience" value={job.experience || "—"} />
        <MetaItem icon={<Briefcase className="size-3" />} label="Type" value={job.employment_type || "—"} />
        <MetaItem
          icon={<CalendarClock className="size-3" />}
          label="Posted"
          value={job.posted_at ? `${formatDate(job.posted_at)} (${timeAgo(job.posted_at)})` : "—"}
        />
        <MetaItem icon={<Hash className="size-3" />} label="First seen" value={formatDate(job.first_seen_at)} />
      </dl>

      {job.tags.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase">Skills &amp; tags</p>
          <Chips items={job.tags} tone="brand" />
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase">Job description</p>
        <FormattedText text={job.description || job.snippet || ""} />
      </div>
    </div>
  );
}

export function JobDetailView({ jobId, onClose, variant }: { jobId: number; onClose?: () => void; variant: "drawer" | "page" }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set(["overview"]));

  const load = useCallback(async () => {
    setError(null);
    setJob(null);
    try {
      setJob(await api.getJob(jobId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [jobId]);

  useEffect(() => {
    setTab("overview");
    setVisited(new Set(["overview"]));
    void load();
  }, [load]);

  useJobUpdated((u) => {
    if (u.id === jobId) setJob((j) => (j ? { ...j, ...u, description: j.description } : j));
  });

  const selectTab = (t: TabId) => {
    setTab(t);
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
  };

  const closeBtn = onClose && (
    <button
      onClick={onClose}
      aria-label="Close"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      <X className="size-5" />
    </button>
  );

  if (error) {
    return (
      <div className="p-5">
        {closeBtn && <div className="mb-3 flex justify-end">{closeBtn}</div>}
        <ErrorState
          title={error.toLowerCase().includes("not found") ? "Job not found" : "Couldn't load this job"}
          message={error}
          onRetry={load}
        />
      </div>
    );
  }
  if (!job) {
    return (
      <div>
        {closeBtn && <div className="flex justify-end px-5 pt-4">{closeBtn}</div>}
        <DetailSkeleton />
      </div>
    );
  }

  const pad = variant === "drawer" ? "px-5" : "px-0";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={cx("shrink-0 pt-5", pad)}>
        <div className="flex items-start gap-3">
          <CompanyLogo name={job.company.name} url={job.company.logo_url} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg leading-snug font-semibold text-slate-900 dark:text-white">{job.title}</h2>
            <Link
              to={`/companies/${job.company.id}`}
              className="text-sm font-medium text-slate-600 hover:text-brand-700 hover:underline dark:text-slate-300 dark:hover:text-brand-300"
            >
              {job.company.name}
            </Link>
          </div>
          <ScoreRing score={job.score} size={48} />
          {closeBtn}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {job.is_new && <Badge tone="green">NEW</Badge>}
            <StatusBadge status={job.status} />
            <LocationBadges job={job} />
          </div>
          <JobQuickActions job={job} />
        </div>
        <Tabs<TabId>
          className="mt-4 overflow-x-auto scrollbar-thin"
          value={tab}
          onChange={selectTab}
          tabs={[
            { id: "overview", label: "Overview", icon: <FileText className="size-4" /> },
            { id: "contacts", label: "HR Contacts", icon: <Users className="size-4" /> },
            { id: "resume", label: "Resume Tips", icon: <Wand2 className="size-4" /> },
          ]}
        />
      </header>
      <div className={cx("min-h-0 flex-1 py-5", variant === "drawer" && "overflow-y-auto px-5")}>
        <div hidden={tab !== "overview"}>
          <Overview job={job} />
        </div>
        {visited.has("contacts") && (
          <div hidden={tab !== "contacts"}>
            <ContactsTab jobId={job.id} />
          </div>
        )}
        {visited.has("resume") && (
          <div hidden={tab !== "resume"}>
            <ResumeTipsTab jobId={job.id} />
          </div>
        )}
      </div>
    </div>
  );
}
