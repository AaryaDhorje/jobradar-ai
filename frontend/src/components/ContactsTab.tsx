import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BadgeCheck, Globe, Info, Lightbulb, Mail, RotateCw, UserRound } from "lucide-react";
import { api, errorMessage, type Contact, type ContactsResponse } from "../api";
import { Badge, Button, CopyButton, EmptyState, ErrorState, SlowLoader, Tooltip } from "./ui";

const SOURCE_LABEL: Record<Contact["source"], string> = {
  job_post: "Job post",
  hunter: "Hunter.io",
  website: "Company website",
  pattern: "Pattern guess",
};

function ConfidenceBadge({ c }: { c: Contact["confidence"] }) {
  switch (c) {
    case "verified":
      return (
        <Badge tone="green" icon={<BadgeCheck className="size-3" />}>
          Verified
        </Badge>
      );
    case "high":
      return <Badge tone="green">High confidence</Badge>;
    case "medium":
      return <Badge tone="amber">Medium confidence</Badge>;
    case "guessed":
      return (
        <Tooltip label="Pattern guess — not confirmed">
          <span tabIndex={0} className="cursor-help">
            <Badge tone="slate">Guessed</Badge>
          </span>
        </Tooltip>
      );
  }
}

const ORDER: Record<Contact["confidence"], number> = { verified: 0, high: 1, medium: 2, guessed: 3 };

function DomainForm({ companyId, companyName, onSaved }: { companyId: number; companyName: string; onSaved: () => void }) {
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = domain
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) {
      setError("Enter a valid domain, e.g. example.com");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setCompanyDomain(companyId, clean);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <Globe className="size-4" /> Company domain unknown
      </p>
      <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
        We couldn't determine {companyName}'s website. Add its domain to look up HR contacts.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          placeholder="e.g. company.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          aria-label="Company domain"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" loading={saving}>
          Save &amp; search
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  );
}

export function ContactsTab({ jobId }: { jobId: number }) {
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getContacts(jobId, refresh);
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
        title={data ? "Refreshing HR contacts…" : "Finding HR contacts…"}
        hint="Checking the job post, Hunter.io and the company website. This usually takes 5–20 seconds."
      />
    );
  }

  if (error) return <ErrorState title="Couldn't load contacts" message={error} onRetry={() => load(false)} />;
  if (!data) return null;

  const contacts = [...data.contacts].sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {data.domain ? (
            <>
              Domain: <span className="font-medium text-slate-700 dark:text-slate-200">{data.domain}</span>
            </>
          ) : (
            <>Contacts for {data.company_name}</>
          )}
        </div>
        <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => load(true)}>
          Refresh
        </Button>
      </div>

      {!data.domain && <DomainForm companyId={data.company_id} companyName={data.company_name} onSaved={() => load(true)} />}

      {contacts.length === 0 ? (
        <EmptyState
          icon={<Mail className="size-5" />}
          title="No contacts found yet"
          description={
            data.domain
              ? "We couldn't find any HR or recruiter emails for this company. Try refreshing later, or apply via the job link."
              : "Add the company's domain above so we can search for recruiter emails."
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {contacts.map((c) => (
            <li key={c.email} className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={`mailto:${c.email}`}
                    className="block truncate font-medium text-slate-900 hover:text-brand-700 hover:underline dark:text-slate-100 dark:hover:text-brand-300"
                  >
                    {c.email}
                  </a>
                  {(c.name || c.position) && (
                    <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                      {[c.name, c.position].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ConfidenceBadge c={c.confidence} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">via {SOURCE_LABEL[c.source] ?? c.source}</span>
                  </div>
                  {c.note && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{c.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <CopyButton text={c.email} />
                  <a
                    href={`mailto:${c.email}`}
                    aria-label={`Email ${c.email}`}
                    title="Compose email"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Mail className="size-3.5" />
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {contacts.some((c) => c.confidence === "guessed") && (
        <p className="flex gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Info className="mt-px size-3.5 shrink-0" />
          Guessed addresses follow common company email patterns and are checked against the domain's mail server, but are not confirmed to exist.
        </p>
      )}

      {data.errors?.map((err) => (
        <p key={err} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {err}
        </p>
      ))}

      {!data.hunter_configured && (
        <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          <Lightbulb className="mt-px size-3.5 shrink-0 text-amber-500" />
          Tip: adding a Hunter.io API key in backend/.env finds more verified recruiter emails.
        </p>
      )}
    </div>
  );
}
