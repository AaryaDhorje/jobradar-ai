import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Briefcase, FileUser, Moon, Settings, Sun } from "lucide-react";
import { api } from "../api";
import { registerSourceLabels } from "../lib/format";
import { useTheme } from "../lib/theme";
import { JobDrawerHost } from "./JobDrawer";
import { cx } from "./ui";

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand-600 dark:fill-brand-500" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="2" opacity=".5" />
      <circle cx="16" cy="16" r="4.5" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M16 16 L24 9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.8" fill="#fff" />
    </svg>
  );
}

const links = [
  { to: "/", label: "Jobs", icon: Briefcase, end: true },
  { to: "/resume", label: "Resume", icon: FileUser, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function Layout() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();

  // Pull human-friendly source labels once (falls back to built-in names if unavailable).
  useEffect(() => {
    api
      .getSettings()
      .then((s) => registerSourceLabels(Object.fromEntries(s.sources.map((src) => [src.name, src.label]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
              JobRadar <span className="text-brand-600 dark:text-brand-400">AI</span>
            </span>
          </NavLink>
          <nav className="ml-auto flex items-center gap-0.5 sm:ml-6 sm:gap-1">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={label}
                className={({ isActive }) =>
                  cx(
                    "inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition sm:px-3",
                    isActive || (to === "/" && (pathname.startsWith("/jobs/") || pathname.startsWith("/companies/")))
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
                  )
                }
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:ml-auto dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-400 dark:border-slate-800">
        JobRadar AI · AI &amp; ML roles across India, refreshed daily
      </footer>
      <JobDrawerHost />
    </div>
  );
}
