import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  ChevronDown,
  Code2,
  ExternalLink,
  Flag,
  Globe,
  GraduationCap,
  HeartHandshake,
  Lightbulb,
  MapPinned,
  MessageCircleQuestion,
  MessagesSquare,
  Package,
  RotateCw,
  Rocket,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  TriangleAlert,
  UsersRound,
  Workflow,
} from "lucide-react";
import { api, errorMessage, type CompanyDetail, type Insights } from "../api";
import { hostOf, plural, timeAgo, websiteUrl } from "../lib/format";
import { useJobUpdated } from "../lib/events";
import { JobCard } from "../components/JobCard";
import { useOpenJob } from "../components/jobActions";
import {
  BulletList,
  Button,
  Chips,
  CompanyLogo,
  EmptyState,
  ErrorState,
  PageLoader,
  SectionTitle,
  SlowLoader,
  cx,
} from "../components/ui";

function InfoCard({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("card p-5", className)}>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      {children}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  if (!text?.trim()) return <p className="text-sm text-slate-400">—</p>;
  return <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-300">{text}</p>;
}

function AboutSection({ s }: { s: Insights["summary"] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoCard icon={<Building2 className="size-4" />} title="Overview" className="lg:col-span-2">
        <Prose text={s.overview} />
      </InfoCard>
      <InfoCard icon={<Rocket className="size-4" />} title="What they do">
        <BulletList items={s.what_they_do} />
      </InfoCard>
      <InfoCard icon={<Package className="size-4" />} title="Products">
        <BulletList items={s.products} />
      </InfoCard>
      <InfoCard icon={<Code2 className="size-4" />} title="Tech stack" className="lg:col-span-2">
        <Chips items={s.tech_stack} tone="brand" />
      </InfoCard>
      <InfoCard icon={<TrendingUp className="size-4" />} title="Size & stage">
        <Prose text={s.size_and_stage} />
      </InfoCard>
      <InfoCard icon={<MapPinned className="size-4" />} title="India presence">
        <Prose text={s.india_presence} />
      </InfoCard>
      <InfoCard icon={<HeartHandshake className="size-4" />} title="Culture">
        <BulletList items={s.culture} />
      </InfoCard>
      <InfoCard icon={<ThumbsUp className="size-4" />} title="Why join">
        <BulletList items={s.why_join} marker="check" />
      </InfoCard>
      <InfoCard icon={<TriangleAlert className="size-4" />} title="Watch-outs" className="lg:col-span-2">
        <BulletList items={s.watch_outs} marker="warn" />
      </InfoCard>
    </div>
  );
}

function QuestionItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium text-slate-900 dark:text-slate-100">{q}</span>
        <span className="hidden shrink-0 text-xs font-medium text-brand-600 sm:inline dark:text-brand-400">
          {open ? "Hide answer" : "How to answer"}
        </span>
        <ChevronDown className={cx("size-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pt-3 pb-4 pl-13 dark:border-slate-800">
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-600 dark:text-slate-400">{a}</p>
        </div>
      )}
    </li>
  );
}

function InterviewSection({ iv }: { iv: Insights["interview"] }) {
  return (
    <div className="space-y-4">
      <InfoCard icon={<Workflow className="size-4" />} title="Interview process">
        {iv.process.length === 0 ? (
          <p className="text-sm text-slate-400">—</p>
        ) : (
          <ol className="relative">
            {iv.process.map((step, i) => (
              <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {i < iv.process.length - 1 && (
                  <span className="absolute top-8 bottom-0 left-[15px] w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
                )}
                <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-brand-500 bg-white text-xs font-bold text-brand-700 dark:bg-slate-900 dark:text-brand-300">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.round}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </InfoCard>

      <InfoCard icon={<GraduationCap className="size-4" />} title="Technical topics to revise">
        <Chips items={iv.technical_topics} tone="brand" />
      </InfoCard>

      <InfoCard icon={<MessageCircleQuestion className="size-4" />} title="Sample technical questions">
        {iv.sample_questions.length === 0 ? (
          <p className="text-sm text-slate-400">—</p>
        ) : (
          <ul className="space-y-2">
            {iv.sample_questions.map((q, i) => (
              <QuestionItem key={i} q={q.question} a={q.how_to_answer} index={i} />
            ))}
          </ul>
        )}
      </InfoCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard icon={<UsersRound className="size-4" />} title="Behavioral questions">
          <BulletList items={iv.behavioral_questions} />
        </InfoCard>
        <InfoCard icon={<Lightbulb className="size-4" />} title="Tips">
          <BulletList items={iv.tips} marker="check" />
        </InfoCard>
      </div>

      <InfoCard icon={<MessagesSquare className="size-4" />} title="Questions to ask them">
        <BulletList items={iv.questions_to_ask} />
      </InfoCard>
    </div>
  );
}

export function CompanyPage() {
  const { id } = useParams();
  const companyId = id && /^\d+$/.test(id) ? Number(id) : null;
  const openJob = useOpenJob();

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [section, setSection] = useState<"about" | "interview">("about");

  const load = useCallback(async () => {
    if (companyId === null) return;
    setError(null);
    setCompany(null);
    try {
      const c = await api.getCompany(companyId);
      setCompany(c);
      setInsights(c.insights);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [companyId]);

  useEffect(() => {
    setInsights(null);
    setInsightsError(null);
    void load();
  }, [load]);

  useJobUpdated((u) => {
    setCompany((c) => (c ? { ...c, jobs: c.jobs.map((j) => (j.id === u.id ? { ...j, ...u } : j)) } : c));
  });

  const generate = async (refresh: boolean) => {
    if (companyId === null) return;
    setGenerating(true);
    setInsightsError(null);
    try {
      setInsights(await api.generateInsights(companyId, refresh));
    } catch (err) {
      setInsightsError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  if (companyId === null) return <ErrorState title="Company not found" message="This link doesn't point to a valid company." />;
  if (error)
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState title={error.toLowerCase().includes("not found") ? "Company not found" : "Couldn't load company"} message={error} onRetry={load} />
      </div>
    );
  if (!company) return <PageLoader label="Loading company…" />;

  const site = websiteUrl(company.website, company.domain);

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="card overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-600 via-indigo-500 to-violet-500 sm:h-24 dark:from-brand-700 dark:via-indigo-700 dark:to-violet-700" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-6">
          <div className="-mt-8 rounded-2xl bg-white p-1 shadow-sm sm:-mt-10 dark:bg-slate-900">
            <CompanyLogo name={company.name} url={company.logo_url} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              {site ? (
                <a
                  href={site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-brand-700 hover:underline dark:hover:text-brand-300"
                >
                  <Globe className="size-3.5" />
                  {hostOf(site)}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="size-3.5" /> Website unknown
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="size-3.5" />
                {plural(company.job_count, "open role")}
              </span>
            </div>
          </div>
          {insights && !generating && (
            <Button icon={<RotateCw className="size-4" />} onClick={() => generate(true)}>
              Regenerate insights
            </Button>
          )}
        </div>
      </div>

      {/* Insights */}
      <section className="space-y-4">
        {generating ? (
          <div className="card">
            <SlowLoader
              title={insights ? "Regenerating company insights…" : "Researching the company…"}
              hint="Our AI is putting together a company profile and interview prep guide. This usually takes 15–30 seconds."
            />
          </div>
        ) : insightsError ? (
          <ErrorState title="Couldn't generate insights" message={insightsError} onRetry={() => generate(!!insights)} />
        ) : !insights ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <Sparkles className="size-6" />
            </span>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Company insights &amp; interview prep</h2>
            <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
              Generate an AI briefing on {company.name}: what they build, tech stack, culture, India presence, plus their likely interview
              process, sample questions and how to answer them.
            </p>
            <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => generate(false)} className="mt-2">
              Generate company insights
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70" role="tablist">
                {(
                  [
                    { id: "about", label: "About the company", icon: <Building2 className="size-4" /> },
                    { id: "interview", label: "Interview preparation", icon: <Flag className="size-4" /> },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={section === t.id}
                    onClick={() => setSection(t.id)}
                    className={cx(
                      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition",
                      section === t.id
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                    )}
                  >
                    {t.icon}
                    <span className="sm:hidden">{t.id === "about" ? "About" : "Interview prep"}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                ))}
              </div>
              {insights.updated_at && <p className="text-xs text-slate-400">Updated {timeAgo(insights.updated_at)}</p>}
            </div>
            {section === "about" ? <AboutSection s={insights.summary} /> : <InterviewSection iv={insights.interview} />}
          </>
        )}
      </section>

      {/* Jobs */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Open roles at {company.name} <span className="font-normal text-slate-400">({company.jobs.length < company.job_count ? `showing ${company.jobs.length} of ${company.job_count}` : company.jobs.length})</span>
        </h2>
        {company.jobs.length === 0 ? (
          <EmptyState icon={<Briefcase className="size-5" />} title="No open AI/ML roles right now" description="New openings will appear here after the next scan." />
        ) : (
          company.jobs.map((job) => <JobCard key={job.id} job={job} onOpen={(j) => openJob(j.id)} />)
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
    >
      <ArrowLeft className="size-4" /> All jobs
    </Link>
  );
}
