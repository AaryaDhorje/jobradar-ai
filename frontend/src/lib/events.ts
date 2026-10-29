import { useEffect, useRef } from "react";
import type { Job } from "../api";

// Lightweight cross-component signal so a status change made in the job drawer
// is reflected in whichever job list is on screen (and vice versa).
const JOB_UPDATED = "jobradar:job-updated";

export function emitJobUpdated(job: Job) {
  window.dispatchEvent(new CustomEvent<Job>(JOB_UPDATED, { detail: job }));
}

export function useJobUpdated(handler: (job: Job) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (e: Event) => ref.current((e as CustomEvent<Job>).detail);
    window.addEventListener(JOB_UPDATED, listener);
    return () => window.removeEventListener(JOB_UPDATED, listener);
  }, []);
}
