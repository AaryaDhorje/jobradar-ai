import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage, type Job, type JobStatus } from "../api";
import { emitJobUpdated } from "../lib/events";
import { DESKTOP_QUERY } from "../lib/hooks";
import { useToast } from "./Toast";

/** PATCH a job's status, broadcast the change, and offer undo where useful. */
export function useSetJobStatus() {
  const toast = useToast();

  const setStatus = useCallback(
    async (job: Job, status: JobStatus, opts: { silent?: boolean } = {}): Promise<Job | null> => {
      const previous = job.status;
      // optimistic broadcast
      emitJobUpdated({ ...job, status });
      try {
        const updated = await api.setJobStatus(job.id, status);
        emitJobUpdated(updated);
        if (!opts.silent) {
          if (status === "hidden") {
            toast.show(`Hidden "${job.title}"`, {
              action: {
                label: "Undo",
                onClick: () => {
                  void setStatus(updated, previous, { silent: true });
                },
              },
            });
          } else if (status === "saved") {
            toast.success("Saved to your shortlist");
          } else if (status === "applied") {
            toast.success("Marked as applied");
          }
        }
        return updated;
      } catch (err) {
        emitJobUpdated({ ...job, status: previous });
        toast.error(`Couldn't update job: ${errorMessage(err)}`);
        return null;
      }
    },
    [toast],
  );

  return setStatus;
}

/** Open a job: side drawer on desktop (?job=id), full page on mobile. */
export function useOpenJob() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  return useCallback(
    (jobId: number) => {
      if (window.matchMedia(DESKTOP_QUERY).matches && !location.pathname.startsWith("/jobs/")) {
        const next = new URLSearchParams(params);
        next.set("job", String(jobId));
        setParams(next);
      } else {
        navigate(`/jobs/${jobId}`);
      }
    },
    [navigate, location.pathname, params, setParams],
  );
}
