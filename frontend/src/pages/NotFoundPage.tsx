import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        icon={<Compass className="size-5" />}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500"
          >
            Back to jobs
          </Link>
        }
      />
    </div>
  );
}
