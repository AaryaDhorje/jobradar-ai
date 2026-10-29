// Typed client for the JobRadar AI backend. All URLs are relative (/api/...) so the
// same build works behind the Vite dev proxy and when served by the FastAPI backend.

export type Tag = "pune" | "india" | "remote";
export type JobStatus = "saved" | "applied" | "hidden" | null;

export interface CompanyRef {
  id: number;
  name: string;
  logo_url: string | null;
}

export interface JobSource {
  source: string;
  url: string;
}

export interface Job {
  id: number;
  title: string;
  company: CompanyRef;
  location: string;
  location_tag: Tag;
  remote: boolean;
  url: string;
  sources: JobSource[];
  posted_at: string | null;
  first_seen_at: string;
  is_new: boolean;
  salary: string | null;
  experience: string | null;
  employment_type: string | null;
  score: number;
  status: JobStatus;
  snippet: string;
  tags: string[];
}

export interface JobDetail extends Job {
  description: string;
}

export interface JobList {
  items: Job[];
  total: number;
  page: number;
  page_size: number;
}

export type ContactSource = "job_post" | "hunter" | "website" | "pattern";
export type ContactConfidence = "verified" | "high" | "medium" | "guessed";

export interface Contact {
  email: string;
  name: string | null;
  position: string | null;
  source: ContactSource;
  confidence: ContactConfidence;
  note: string | null;
}

export interface ContactsResponse {
  company_id: number;
  company_name: string;
  domain: string | null;
  hunter_configured: boolean;
  errors?: string[];
  contacts: Contact[];
}

export interface ResumeAdvice {
  has_resume: boolean;
  match_score: number | null;
  verdict: string;
  strengths: string[];
  gaps: string[];
  missing_keywords: string[];
  improvements: { section: string; suggestion: string }[];
  bullet_rewrites: { before: string; after: string }[];
  recommended_format: string;
  tailored_summary: string;
  ats_tips: string[];
  generated_at: string;
}

export interface Insights {
  summary: {
    overview: string;
    what_they_do: string[];
    products: string[];
    tech_stack: string[];
    size_and_stage: string;
    culture: string[];
    india_presence: string;
    why_join: string[];
    watch_outs: string[];
  };
  interview: {
    process: { round: string; description: string }[];
    technical_topics: string[];
    sample_questions: { question: string; how_to_answer: string }[];
    behavioral_questions: string[];
    tips: string[];
    questions_to_ask: string[];
  };
  updated_at: string;
}

export interface CompanyDetail {
  id: number;
  name: string;
  domain: string | null;
  website: string | null;
  logo_url: string | null;
  job_count: number;
  jobs: Job[];
  insights: Insights | null;
}

export interface SourceRunInfo {
  status: "ok" | "error" | "skipped";
  count: number;
  error: string | null;
  duration_s: number;
}

export interface ScanRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  trigger: "manual" | "scheduled";
  total_found: number;
  new_jobs: number;
  sources: Record<string, SourceRunInfo>;
}

export interface Stats {
  total_jobs: number;
  new_jobs: number;
  by_tag: { pune: number; india: number; remote: number };
  by_source: Record<string, number>;
  saved: number;
  applied: number;
  last_scan: ScanRun | null;
  next_scan_at: string | null;
  scan_running: boolean;
}

export type SourceKind = "official" | "public" | "unofficial";

export interface SourceInfo {
  name: string;
  label: string;
  kind: SourceKind;
  enabled: boolean;
  configured: boolean;
  missing_keys: string[];
  description: string;
}

export interface SettingsData {
  scan_time: string;
  timezone: string;
  sources: SourceInfo[];
  keys: Record<string, boolean>;
  openai_model: string;
}

export interface SettingsUpdate {
  scan_time?: string;
  sources?: Record<string, boolean>;
}

export interface ResumeInfo {
  id: number;
  filename: string;
  uploaded_at: string;
  chars: number;
}

export interface JobQuery {
  q?: string;
  tag?: Tag;
  source?: string;
  company_id?: number;
  new_only?: boolean;
  status?: Exclude<JobStatus, null>;
  days?: number;
  sort?: "score" | "date";
  page?: number;
  page_size?: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function extractDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: detail is a list of {loc, msg}
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : null))
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Cannot reach the JobRadar server. Is the backend running?");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const detail = extractDetail(body);
    let message = detail ?? `Request failed (${res.status} ${res.statusText})`;
    if (!detail && (res.status === 502 || res.status === 503 || res.status === 504)) {
      message = "The JobRadar server is unavailable. Is the backend running?";
    }
    throw new ApiError(res.status, message);
  }
  return body as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  listJobs: (query: JobQuery) =>
    request<JobList>(`/api/jobs${qs({ ...query })}`),
  getJob: (id: number) => request<JobDetail>(`/api/jobs/${id}`),
  setJobStatus: (id: number, status: JobStatus) =>
    request<Job>(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  getContacts: (id: number, refresh = false) =>
    request<ContactsResponse>(`/api/jobs/${id}/contacts${qs({ refresh })}`),
  getResumeAdvice: (id: number, refresh = false) =>
    request<ResumeAdvice>(`/api/jobs/${id}/resume-advice${qs({ refresh })}`, { method: "POST" }),

  getCompany: (id: number) => request<CompanyDetail>(`/api/companies/${id}`),
  setCompanyDomain: (id: number, domain: string) =>
    request<CompanyDetail>(`/api/companies/${id}`, { method: "PATCH", body: JSON.stringify({ domain }) }),
  generateInsights: (id: number, refresh = false) =>
    request<Insights>(`/api/companies/${id}/insights${qs({ refresh })}`, { method: "POST" }),

  getStats: () => request<Stats>("/api/stats"),
  startScan: () => request<{ run_id: number }>("/api/scan", { method: "POST" }),
  listScans: () => request<ScanRun[]>("/api/scans"),

  getSettings: () => request<SettingsData>("/api/settings"),
  updateSettings: (body: SettingsUpdate) =>
    request<SettingsData>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),

  getResume: () => request<ResumeInfo | null>("/api/resume"),
  uploadResume: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ResumeInfo>("/api/resume", { method: "POST", body: fd });
  },
  deleteResume: () => request<void>("/api/resume", { method: "DELETE" }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
