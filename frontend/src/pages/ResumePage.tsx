import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileText, Lock, ScanSearch, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { api, errorMessage, type ResumeInfo } from "../api";
import { formatDateTime, formatNumber, timeAgo } from "../lib/format";
import { useToast } from "../components/Toast";
import { Button, ErrorState, Skeleton, cx } from "../components/ui";

const ACCEPT = [".pdf", ".docx", ".txt"];
const MAX_MB = 10;

function validate(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPT.includes(ext)) return "Please upload a PDF, DOCX or TXT file.";
  if (file.size > MAX_MB * 1024 * 1024) return `File is too large (max ${MAX_MB} MB).`;
  if (file.size === 0) return "That file is empty.";
  return null;
}

export function ResumePage() {
  const toast = useToast();
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setResume(await api.getResume());
      setLoaded(true);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    const problem = validate(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const r = await api.uploadResume(file);
      setResume(r);
      setConfirmDelete(false);
      toast.success("Resume uploaded — resume tips are now personalised");
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteResume();
      setResume(null);
      setConfirmDelete(false);
      toast.success("Resume deleted");
    } catch (err) {
      toast.error(`Couldn't delete resume: ${errorMessage(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Your resume</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload your resume once and every job's <span className="font-medium text-slate-700 dark:text-slate-300">Resume Tips</span> tab will
          score your fit and suggest tailored edits for that specific role.
        </p>
      </div>

      {loadError ? (
        <ErrorState title="Couldn't load your resume" message={loadError} onRetry={load} />
      ) : !loaded ? (
        <div className="card flex items-center gap-4 p-5">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ) : resume ? (
        <div className="card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <FileText className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate font-semibold text-slate-900 dark:text-white">
                {resume.filename}
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              </p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Uploaded {timeAgo(resume.uploaded_at)} ({formatDateTime(resume.uploaded_at)}) · {formatNumber(resume.chars)} characters extracted
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={<UploadCloud className="size-3.5" />} onClick={() => inputRef.current?.click()} loading={uploading}>
                Replace
              </Button>
              {confirmDelete ? (
                <>
                  <Button size="sm" variant="danger" loading={deleting} onClick={remove}>
                    Confirm delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
          {resume.chars < 300 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Very little text was extracted from this file. If it's a scanned PDF, try uploading a DOCX or text-based PDF instead.
            </p>
          )}
        </div>
      ) : null}

      {loaded && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
            dragging
              ? "border-brand-500 bg-brand-50/70 dark:bg-brand-500/10"
              : "border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500/60 dark:hover:bg-slate-900/60",
            uploading && "pointer-events-none opacity-70",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <UploadCloud className={cx("size-6", uploading && "animate-bounce")} />
          </span>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">
              {uploading ? "Uploading and extracting text…" : resume ? "Drop a new file to replace your resume" : "Drop your resume here"}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              or <span className="font-medium text-brand-600 dark:text-brand-400">browse files</span> · PDF, DOCX or TXT up to {MAX_MB} MB
            </p>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",") + ",application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {uploadError && <ErrorState title="Upload failed" message={uploadError} compact />}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: <ScanSearch className="size-4" />, title: "Match score", text: "See how well you fit each role, with strengths and gaps." },
          { icon: <Wand2 className="size-4" />, title: "Tailored rewrites", text: "Get before → after bullet rewrites and a role-specific summary." },
          { icon: <Lock className="size-4" />, title: "Your data", text: "Stored by your JobRadar backend and sent to the AI model only when generating advice." },
        ].map((f) => (
          <div key={f.title} className="card p-4">
            <span className="text-brand-600 dark:text-brand-400">{f.icon}</span>
            <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{f.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.text}</p>
          </div>
        ))}
      </div>

      {resume && (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Ready to go — open any job from the{" "}
          <Link to="/" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            jobs dashboard
          </Link>{" "}
          and choose the Resume Tips tab.
        </p>
      )}
    </div>
  );
}
