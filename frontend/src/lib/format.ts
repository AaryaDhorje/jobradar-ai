import { useSyncExternalStore } from "react";

// Date + text helpers. Backend timestamps are UTC and may lack a "Z" suffix,
// so naive ISO strings are treated as UTC.

const TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  let s = value.trim();
  // Date-only strings ("2026-10-01") are parsed as UTC midnight by spec — fine.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  if (!TZ_SUFFIX.test(s)) s += "Z";
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function timeAgo(value: string | null | undefined, now: number = Date.now()): string {
  const d = parseDate(value);
  if (!d) return "";
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 0) return timeUntil(value, now);
  if (diff < 60) return "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function timeUntil(value: string | null | undefined, now: number = Date.now()): string {
  const d = parseDate(value);
  if (!d) return "";
  const diff = Math.round((d.getTime() - now) / 1000);
  if (diff <= 0) return "due now";
  const m = Math.floor(diff / 60);
  if (m < 1) return "in under a minute";
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  return `in ${Math.floor(h / 24)}d`;
}

export function formatDateTime(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDuration(startIso: string, endIso: string | null): string {
  const a = parseDate(startIso);
  const b = parseDate(endIso);
  if (!a || !b) return "—";
  return formatSeconds((b.getTime() - a.getTime()) / 1000);
}

export function formatSeconds(s: number): string {
  if (!isFinite(s) || s < 0) return "—";
  if (s < 1) return `${Math.round(s * 1000)}ms`;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

const SOURCE_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  jooble: "Jooble",
  jsearch: "JSearch",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  hirist: "Hirist",
  linkedin: "LinkedIn",
  naukri: "Naukri",
};

let dynamicLabels: Record<string, string> = {};
let labelsVersion = 0;
const labelListeners = new Set<() => void>();

export function registerSourceLabels(labels: Record<string, string>) {
  dynamicLabels = { ...dynamicLabels, ...labels };
  labelsVersion++;
  labelListeners.forEach((l) => l());
}

/** Subscribe a component to source-label updates (labels arrive async from /api/settings). */
export function useSourceLabels(): number {
  return useSyncExternalStore(
    (cb) => {
      labelListeners.add(cb);
      return () => labelListeners.delete(cb);
    },
    () => labelsVersion,
  );
}

export function sourceLabel(name: string): string {
  if (dynamicLabels[name]) return dynamicLabels[name];
  const key = name.toLowerCase();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function websiteUrl(website: string | null, domain: string | null): string | null {
  const raw = website || domain;
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
