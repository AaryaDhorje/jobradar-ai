import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DESKTOP_QUERY, useMediaQuery } from "../lib/hooks";
import { JobDetailView } from "./JobDetailView";

/** Renders the job detail drawer when the URL carries ?job=<id>. */
export function JobDrawerHost() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const raw = params.get("job");
  const jobId = raw && /^\d+$/.test(raw) ? Number(raw) : null;

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete("job");
    setParams(next);
  }, [params, setParams]);

  // Drawer is a desktop affordance; on narrow screens switch to the full page.
  useEffect(() => {
    if (jobId !== null && !isDesktop) navigate(`/jobs/${jobId}`, { replace: true });
  }, [jobId, isDesktop, navigate]);

  useEffect(() => {
    if (jobId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [jobId, close]);

  if (jobId === null || !isDesktop) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Job details">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/30 backdrop-blur-[2px] dark:bg-black/50" onClick={close} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl animate-slide-in flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <JobDetailView key={jobId} jobId={jobId} onClose={close} variant="drawer" />
      </aside>
    </div>
  );
}
