import type { ReactNode } from "react";

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h"; text: string };

const BULLET = /^\s*(?:[-*•●▪◦·–]|•)\s+(.*)$/;
const NUMBERED = /^\s*(?:\d{1,2}[.)]|[a-z][.)])\s+(.*)$/i;

function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (/[.,;]$/.test(t)) return false;
  // "Responsibilities:" or "WHAT YOU'LL DO" style headings
  if (/:$/.test(t) && t.split(/\s+/).length <= 7) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(/\s+/).length <= 6) return true;
  return false;
}

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").split("\n");
  let cur: Block | null = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    const b = BULLET.exec(line);
    const n = !b ? NUMBERED.exec(line) : null;
    if (b) {
      if (!cur || cur.kind !== "ul") {
        flush();
        cur = { kind: "ul", items: [] };
      }
      cur.items.push(b[1]);
    } else if (n) {
      if (!cur || cur.kind !== "ol") {
        flush();
        cur = { kind: "ol", items: [] };
      }
      cur.items.push(n[1]);
    } else if (isHeading(line)) {
      flush();
      blocks.push({ kind: "h", text: line.trim().replace(/:$/, "") });
    } else {
      if (!cur || cur.kind !== "p") {
        flush();
        cur = { kind: "p", lines: [] };
      }
      cur.lines.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <a key={i} href={m[0]} target="_blank" rel="noopener noreferrer" className="break-all text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">
        {m[0]}
      </a>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function FormattedText({ text }: { text: string }) {
  const blocks = parse(text);
  if (!blocks.length) return <p className="text-sm text-slate-400">No description available.</p>;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      {blocks.map((b, i) => {
        if (b.kind === "h")
          return (
            <h4 key={i} className="pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {b.text}
            </h4>
          );
        if (b.kind === "ul")
          return (
            <ul key={i} className="ml-1 space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                  <span>{linkify(it)}</span>
                </li>
              ))}
            </ul>
          );
        if (b.kind === "ol")
          return (
            <ol key={i} className="ml-5 list-decimal space-y-1.5 marker:text-slate-400">
              {b.items.map((it, j) => (
                <li key={j} className="pl-1">
                  {linkify(it)}
                </li>
              ))}
            </ol>
          );
        return (
          <p key={i} className="break-words">
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {linkify(l)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
