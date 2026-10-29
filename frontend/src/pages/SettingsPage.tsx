import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  History,
  KeyRound,
  Loader2,
  MinusCircle,
  RotateCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api, errorMessage, type ScanRun, type SettingsData, type SourceInfo, type SourceKind } from "../api";
import { formatDateTime, formatDuration, formatNumber, formatSeconds, sourceLabel, timeAgo, useSourceLabels } from "../lib/format";
import { useToast } from "../components/Toast";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Switch, cx } from "../components/ui";

const KIND_META: Record<SourceKind, { title: string; description: string }> = {
  official: { title: "Official APIs", description: "Job aggregators accessed through their official, documented APIs." },
  public: { title: "Public job boards", description: "Public career-page boards (Greenhouse, Lever, Ashby, …) and open job APIs." },
  unofficial: { title: "Unofficial sources", description: "Sites without an official API. Disabled by default in most setups." },
};

const KEY_LABELS: Record<string, { label: string; purpose: string }> = {
  ai: { label: "AI model (Gemini / Groq / OpenAI…)", purpose: "Resume tips, company insights & interview prep" },
  hunter: { label: "Hunter.io", purpose: "Verified HR / recruiter emails" },
  adzuna: { label: "Adzuna", purpose: "Adzuna India job search" },
  jooble: { label: "Jooble", purpose: "Jooble job search" },
  rapidapi: { label: "RapidAPI (JSearch)", purpose: "Google Jobs listings via JSearch" },
};

function Panel({ icon, title, description, children, action }: { icon: ReactNode; title: string; description?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-brand-600 dark:text-brand-400">{icon}</span>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ------------------------------- Scan schedule ------------------------------ */

function ScheduleForm({ settings, onSaved }: { settings: SettingsData; onSaved: (s: SettingsData) => void }) {
  const toast = useToast();
  const [time, setTime] = useState(settings.scan_time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTime(settings.scan_time), [settings.scan_time]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError("Enter a valid time in 24-hour HH:MM format.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const s = await api.updateSettings({ scan_time: time });
      onSaved(s);
      toast.success(`Daily scan scheduled for ${s.scan_time} IST`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const tzLabel = settings.timezone === "Asia/Kolkata" ? "IST (Asia/Kolkata)" : settings.timezone;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Daily scan time</span>
          <div className="flex items-center gap-2">
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="input w-36 tabular-nums" />
            <span className="text-sm text-slate-500 dark:text-slate-400">{tzLabel}</span>
          </div>
        </label>
        <Button type="submit" variant="primary" loading={saving} disabled={time === settings.scan_time}>
          Save schedule
        </Button>
      </div>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Cpu className="size-3.5" /> AI model: <span className="font-medium text-slate-700 dark:text-slate-300">{settings.openai_model || "—"}</span>
      </p>
    </form>
  );
}

/* ---------------------------------- Sources --------------------------------- */

function SourceRow({ src, onToggle, busy }: { src: SourceInfo; onToggle: (v: boolean) => void; busy: boolean }) {
  return (
    <li className="flex items-start gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900 dark:text-slate-100">{src.label}</p>
          {src.configured ? (
            <Badge tone="green" icon={<CheckCircle2 className="size-3" />}>
              Configured
            </Badge>
          ) : (
            <Badge tone="rose" icon={<KeyRound className="size-3" />} title="Add these keys to backend/.env">
              Missing keys: {src.missing_keys.join(", ") || "unknown"}
            </Badge>
          )}
        </div>
        {src.description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{src.description}</p>}
        {src.kind === "unofficial" && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            Scrapes a site without an official API — may break or be blocked; check the site's terms before commercial use.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        {busy && <Loader2 className="size-3.5 animate-spin text-slate-400" />}
        <Switch checked={src.enabled} onChange={onToggle} disabled={busy} label={`Enable ${src.label}`} />
      </div>
    </li>
  );
}

function SourcesPanel({ settings, onChange }: { settings: SettingsData; onChange: (s: SettingsData) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const toggle = async (src: SourceInfo, enabled: boolean) => {
    setBusy((b) => new Set(b).add(src.name));
    const optimistic = { ...settings, sources: settings.sources.map((s) => (s.name === src.name ? { ...s, enabled } : s)) };
    onChange(optimistic);
    try {
      const s = await api.updateSettings({ sources: { [src.name]: enabled } });
      onChange(s);
    } catch (err) {
      onChange({ ...optimistic, sources: optimistic.sources.map((s) => (s.name === src.name ? { ...s, enabled: !enabled } : s)) });
      toast.error(`Couldn't update ${src.label}: ${errorMessage(err)}`);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(src.name);
        return n;
      });
    }
  };

  const kinds: SourceKind[] = ["official", "public", "unofficial"];
  const enabledCount = settings.sources.filter((s) => s.enabled).length;

  return (
    <Panel
      icon={<Database className="size-5" />}
      title="Job sources"
      description={`${enabledCount} of ${settings.sources.length} sources enabled. Changes apply from the next scan.`}
    >
      {settings.sources.length === 0 ? (
        <p className="text-sm text-slate-500">No sources reported by the backend.</p>
      ) : (
        <div className="space-y-6">
          {kinds.map((kind) => {
            const list = settings.sources.filter((s) => s.kind === kind);
            if (!list.length) return null;
            return (
              <div key={kind}>
                <div className="mb-3">
                  <h3 className={cx("text-xs font-semibold tracking-wider uppercase", kind === "unofficial" ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400")}>
                    {KIND_META[kind].title}
                  </h3>
                  <p className="text-xs text-slate-400">{KIND_META[kind].description}</p>
                </div>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 py-3.5 dark:divide-slate-800 dark:border-slate-800">
                  {list.map((src) => (
                    <SourceRow key={src.name} src={src} busy={busy.has(src.name)} onToggle={(v) => toggle(src, v)} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------- Keys ------------------------------------ */

function KeysPanel({ keys }: { keys: Record<string, boolean> }) {
  const entries = Object.entries(keys);
  return (
    <Panel
      icon={<ShieldCheck className="size-5" />}
      title="API keys"
      description={
        <>
          Keys are set in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">backend/.env</code> — restart the backend after
          changing them.
        </>
      }
    >
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No key status reported by the backend.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {entries.map(([name, ok]) => {
            const meta = KEY_LABELS[name] ?? { label: sourceLabel(name), purpose: "" };
            return (
              <li key={name} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                {ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {meta.label}{" "}
                    <span className={cx("text-xs font-normal", ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                      {ok ? "Set" : "Not set"}
                    </span>
                  </p>
                  {meta.purpose && <p className="text-xs text-slate-500 dark:text-slate-400">{meta.purpose}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------- Scan history ------------------------------- */

function RunStatus({ status }: { status: ScanRun["status"] | "ok" | "error" | "skipped" }) {
  switch (status) {
    case "done":
    case "ok":
      return <Badge tone="green" icon={<CheckCircle2 className="size-3" />}>{status === "done" ? "Done" : "OK"}</Badge>;
    case "failed":
    case "error":
      return <Badge tone="rose" icon={<XCircle className="size-3" />}>{status === "failed" ? "Failed" : "Error"}</Badge>;
    case "running":
      return <Badge tone="brand" icon={<Loader2 className="size-3 animate-spin" />}>Running</Badge>;
    case "skipped":
      return <Badge tone="slate" icon={<MinusCircle className="size-3" />}>Skipped</Badge>;
  }
}

function ScanHistory() {
  useSourceLabels();
  const [runs, setRuns] = useState<ScanRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await api.listScans());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Panel
      icon={<History className="size-5" />}
      title="Scan history"
      description="Every scan run, with per-source results."
      action={
        <Button size="sm" icon={<RotateCw className={cx("size-3.5", loading && "animate-spin")} />} onClick={load} disabled={loading}>
          Refresh
        </Button>
      }
    >
      {error ? (
        <ErrorState title="Couldn't load scan history" message={error} onRetry={load} compact />
      ) : runs === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No scans yet" description="Run a scan from the Jobs dashboard, or wait for the daily scheduled scan." />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="w-8 py-2 pl-5" />
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4">Trigger</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Found</th>
                <th className="py-2 pr-4 text-right">New</th>
                <th className="py-2 pr-5 text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const isOpen = open.has(run.id);
                const sources = Object.entries(run.sources ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
                const errors = sources.filter(([, s]) => s.status === "error").length;
                return (
                  <Fragment key={run.id}>
                    <tr
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40"
                      onClick={() => toggle(run.id)}
                      aria-expanded={isOpen}
                    >
                      <td className="py-2.5 pl-5">
                        <ChevronRight className={cx("size-4 text-slate-400 transition", isOpen && "rotate-90")} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{formatDateTime(run.started_at)}</p>
                        <p className="text-xs text-slate-400">{timeAgo(run.started_at)}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-600 capitalize dark:text-slate-300">
                          {run.trigger === "scheduled" ? <Clock className="size-3.5" /> : <RotateCw className="size-3.5" />}
                          {run.trigger}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <RunStatus status={run.status} />
                          {errors > 0 && <span className="text-xs text-rose-600 dark:text-rose-400">{errors} source{errors > 1 ? "s" : ""} failed</span>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatNumber(run.total_found)}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                        {run.new_jobs > 0 ? `+${formatNumber(run.new_jobs)}` : "0"}
                      </td>
                      <td className="py-2.5 pr-5 text-right text-slate-500 tabular-nums dark:text-slate-400">
                        {run.finished_at ? formatDuration(run.started_at, run.finished_at) : "—"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800/70 dark:bg-slate-900/60">
                        <td colSpan={7} className="px-5 py-3">
                          {sources.length === 0 ? (
                            <p className="text-sm text-slate-500">No per-source details recorded.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-slate-500 dark:text-slate-400">
                                  <th className="py-1.5 pr-4 text-left font-medium">Source</th>
                                  <th className="py-1.5 pr-4 text-left font-medium">Status</th>
                                  <th className="py-1.5 pr-4 text-right font-medium">Jobs</th>
                                  <th className="py-1.5 pr-4 text-right font-medium">Time</th>
                                  <th className="py-1.5 text-left font-medium">Error</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sources.map(([name, s]) => (
                                  <tr key={name} className="border-t border-slate-200/70 dark:border-slate-800">
                                    <td className="py-1.5 pr-4 font-medium text-slate-800 dark:text-slate-200">{sourceLabel(name)}</td>
                                    <td className="py-1.5 pr-4">
                                      <RunStatus status={s.status} />
                                    </td>
                                    <td className="py-1.5 pr-4 text-right tabular-nums">{formatNumber(s.count)}</td>
                                    <td className="py-1.5 pr-4 text-right text-slate-500 tabular-nums">{formatSeconds(s.duration_s)}</td>
                                    <td className={cx("max-w-xs py-1.5 text-xs break-words", s.status === "error" ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400")}>{s.error ?? ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------- Page ----------------------------------- */

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSettings(await api.getSettings());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Scan schedule, job sources, API keys and scan history.</p>
      </div>

      {error ? (
        <ErrorState title="Couldn't load settings" message={error} onRetry={load} />
      ) : !settings ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Panel icon={<Clock className="size-5" />} title="Scan schedule" description="JobRadar scans all enabled sources once a day at this time.">
            <ScheduleForm settings={settings} onSaved={setSettings} />
          </Panel>
          <SourcesPanel settings={settings} onChange={setSettings} />
          <KeysPanel keys={settings.keys} />
        </>
      )}

      <ScanHistory />
    </div>
  );
}
