import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { JobDetailView } from "../components/JobDetailView";
import { ErrorState } from "../components/ui";

export function JobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const jobId = id && /^\d+$/.test(id) ? Number(id) : null;

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={back}
        className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      {jobId === null ? (
        <ErrorState title="Job not found" message="This link doesn't point to a valid job." />
      ) : (
        <div className="card px-4 pb-2 sm:px-6">
          <JobDetailView key={jobId} jobId={jobId} variant="page" />
        </div>
      )}
    </div>
  );
}
