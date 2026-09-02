import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const navGroups = [
  {
    label: "Boshqaruv",
    items: [
      { to: "/", label: "Bosh sahifa", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
      { to: "/classes", label: "Sinflar", icon: "M17 20h5v-2a3 3 0 00-3-3M9 20H4v-2a3 3 0 013-3m6-3a3 3 0 100-6 3 3 0 000 6zM9 12a3 3 0 100-6 3 3 0 000 6z" },
      { to: "/schedule", label: "Dars jadvali", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14H3V6a2 2 0 012-2z" },
    ],
  },
  {
    label: "Kontent",
    items: [
      { to: "/topics", label: "Mavzular", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
      { to: "/textbooks", label: "Darsliklar", icon: "M12 6.253c1.126-.653 2.26-.997 3.5-.997 1.24 0 2.374.344 3.5.997V18.25c-1.126-.652-2.26-.997-3.5-.997-1.24 0-2.374.345-3.5.997m0-12c-1.126-.653-2.26-.997-3.5-.997-1.24 0-2.374.344-3.5.997v12c1.126-.652 2.26-.997 3.5-.997 1.24 0 2.374.345 3.5.997m0-12v12" },
      { to: "/planner", label: "Yillik rejalar", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
      { to: "/materials", label: "Materiallar", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
    ],
  },
  {
    label: "Testlar",
    items: [
      { to: "/tests", label: "Testlar", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
      { to: "/quality", label: "Sifat nazorati", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0" },
      { to: "/results", label: "Natijalar", icon: "M9 19v-6m6 6V9m-6 10a1 1 0 01-1-1H5a1 1 0 01-1-1v-2a1 1 0 011-1h3a1 1 0 011 1v2zm6-6a1 1 0 011-1h3a1 1 0 011 1v5a1 1 0 01-1 1h-3a1 1 0 01-1-1v-5z" },
    ],
  },
  {
    label: "Tahlil",
    items: [
      { to: "/reports", label: "Hisobotlar", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      { to: "/audit", label: "Audit log", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    label: "Tizim",
    items: [
      { to: "/admin", label: "Admin", icon: "M12 15a3 3 0 100-6 3 3 0 000 6z M3 12a9 9 0 0118 0" },
      { to: "/settings", label: "Sozlamalar", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
];

function NavLinks({ onNavigate }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Asosiy navigatsiya">
      {navGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500" aria-hidden="true">
            {group.label}
          </div>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `mb-0.5 flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-primary-700 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <svg className={`h-5 w-5 shrink-0 ${isActive ? "text-accent-400" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span className="flex-1">{item.label}</span>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarHeader() {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-sm font-bold text-white">AI</div>
      <div className="min-w-0">
        <div className="truncate font-display text-sm font-bold text-white">AI Teacher Agent</div>
        <div className="text-xs text-slate-400">O'qituvchi tizimi</div>
      </div>
    </div>
  );
}

function SidebarFooter({ user, logout }) {
  return (
    <div className="border-t border-slate-800 px-5 py-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-200" aria-hidden="true">
          {user?.name?.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">{user?.name}</div>
          <div className="truncate text-xs text-slate-400">{user?.school_name}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Chiqish
      </button>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">Asosiy kontentga o'tish</a>

      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 lg:flex" aria-label="Sidebar">
        <SidebarHeader />
        <NavLinks />
        <SidebarFooter user={user} logout={logout} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigatsiya menyusi"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-slate-900 shadow-drawer animate-slide-in-left"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pr-2">
              <SidebarHeader />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Menyuni yopish"
                className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter user={user} logout={logout} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[56px] items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menyuni ochish"
            aria-expanded={drawerOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-stone-100 active:bg-stone-200"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-700 text-xs font-bold text-white">AI</div>
            <span className="font-display text-sm font-bold text-slate-900">AI Teacher Agent</span>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Chiqish"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </header>

        <main id="main-content" className="page-enter flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
