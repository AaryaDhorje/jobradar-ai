import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  FileText,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  PenLine,
  RotateCw,
  ScanSearch,
  ThumbsUp,
  TriangleAlert,
  Upload,
  Wand2,
} from "lucide-react";
import { api, errorMessage, type ResumeAdvice } from "../api";
import { timeAgo } from "../lib/format";
import { BulletList, Button, Chips, CopyButton, ErrorState, ScoreRing, SectionTitle, SlowLoader, scoreTone } from "./ui";

function Section({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <SectionTitle icon={icon} action={action}>
        {title}
      </SectionTitle>
      {children}
    </section>
  );
}

export function ResumeTipsTab({ jobId }: { jobId: number }) {
  const [data, setData] = useState<ResumeAdvice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getResumeAdvice(jobId, refresh);
        if (id === reqId.current) setData(res);
      } catch (err) {
        if (id === reqId.current) setError(errorMessage(err));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [jobId],
  );

  useEffect(() => {
    setData(null);
    void load(false);
  }, [load]);

  if (loading) {
    return (
      <SlowLoader
        title={data ? "Regenerating advice…" : "Analysing this role…"}
        hint="Our AI is comparing the job description with your resume. This usually takes 10–30 seconds."
      />
    );
  }

  if (error)
    return (
      <ErrorState
        title="Couldn't generate resume advice"
        message={error}
        onRetry={() => load(false)}
      />
    );
  if (!data) return null;

  const tone = data.match_score !== null ? scoreTone(data.match_score) : null;

  return (
    <div className="space-y-4">
      {!data.has_resume && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4 sm:flex-row sm:items-center dark:border-brand-500/30 dark:bg-brand-500/10">
          <FileText className="size-5 shrink-0 text-brand-600 dark:text-brand-400" />
          <p className="flex-1 text-sm text-brand-900 dark:text-brand-200">
            <span className="font-semibold">Get personalised advice.</span> Upload your resume and we'll score your fit for this job and
            rewrite your bullets for it. The tips below are general.
          </p>
          <Link
            to="/resume"
            className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700 sm:self-auto dark:bg-brand-500"
          >
            <Upload className="size-3.5" /> Upload resume
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/40">
        {data.has_resume && data.match_score !== null && (
          <div className="flex items-center gap-3">
            <ScoreRing score={data.match_score} size={64} title={`Resume match ${data.match_score}/100`} />
            <div className="sm:hidden">
              <p className="text-xs uppercase tracking-wide text-slate-500">Resume match</p>
              <p className={`font-semibold ${tone?.text}`}>{tone?.label}</p>
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {data.has_resume && data.match_score !== null && (
            <p className="hidden text-xs font-medium uppercase tracking-wide text-slate-500 sm:block dark:text-slate-400">
              Resume match · <span className={tone?.text}>{tone?.label}</span>
            </p>
          )}
          <p className="mt-0.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{data.verdict}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => load(true)}>
            Regenerate
          </Button>
          {data.generated_at && <span className="text-[11px] text-slate-400">Generated {timeAgo(data.generated_at)}</span>}
        </div>
      </div>

      {(data.strengths.length > 0 || data.gaps.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section icon={<ThumbsUp className="size-4" />} title="Strengths">
            <BulletList items={data.strengths} marker="check" />
          </Section>
          <Section icon={<TriangleAlert className="size-4" />} title="Gaps">
            <BulletList items={data.gaps} marker="warn" />
          </Section>
        </div>
      )}

      {data.missing_keywords.length > 0 && (
        <Section icon={<KeyRound className="size-4" />} title="Missing keywords">
          <Chips items={data.missing_keywords} tone="amber" />
        </Section>
      )}

      {data.improvements.length > 0 && (
        <Section icon={<ListChecks className="size-4" />} title="Improvements">
          <ul className="space-y-3">
            {data.improvements.map((imp, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium text-slate-900 dark:text-slate-100">{imp.section}</p>
                <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-400">{imp.suggestion}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.bullet_rewrites.length > 0 && (
        <Section icon={<PenLine className="size-4" />} title="Bullet rewrites">
          <ul className="space-y-3">
            {data.bullet_rewrites.map((r, i) => (
              <li key={i} className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Before</p>
                  <p className="leading-relaxed line-through decoration-slate-300 dark:decoration-slate-600">{r.before}</p>
                </div>
                <div className="flex items-center justify-center text-slate-400">
                  <ArrowRight className="hidden size-4 md:block" />
                  <ArrowDown className="size-4 md:hidden" />
                </div>
                <div className="relative rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">After</p>
                    <CopyButton text={r.after} className="-my-1 -mr-1 h-6 w-6" />
                  </div>
                  <p className="leading-relaxed">{r.after}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.tailored_summary && (
        <Section
          icon={<Wand2 className="size-4" />}
          title="Tailored summary"
          action={<CopyButton text={data.tailored_summary} label="Copy" />}
        >
          <blockquote className="border-l-2 border-brand-400 pl-3 text-sm leading-relaxed text-slate-700 italic dark:text-slate-300">
            {data.tailored_summary}
          </blockquote>
        </Section>
      )}

      {data.recommended_format && (
        <Section icon={<LayoutTemplate className="size-4" />} title="Recommended format">
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-300">{data.recommended_format}</p>
        </Section>
      )}

      {data.ats_tips.length > 0 && (
        <Section icon={<ScanSearch className="size-4" />} title="ATS tips">
          <BulletList items={data.ats_tips} />
        </Section>
      )}
    </div>
  );
}
