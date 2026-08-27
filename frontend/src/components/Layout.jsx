import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const navItems = [
  { to: "/", label: "Bosh sahifa", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { to: "/classes", label: "Sinflar", icon: "M17 20h5v-2a3 3 0 00-3-3M9 20H4v-2a3 3 0 013-3m6-3a3 3 0 100-6 3 3 0 000 6zM9 12a3 3 0 100-6 3 3 0 000 6z" },
  { to: "/schedule", label: "Jadval", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14H3V6a2 2 0 012-2z" },
  { to: "/topics", label: "Mavzular", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { to: "/textbooks", label: "Darsliklar", icon: "M12 6.253c1.126-.653 2.26-.997 3.5-.997 1.24 0 2.374.344 3.5.997V18.25c-1.126-.652-2.26-.997-3.5-.997-1.24 0-2.374.345-3.5.997m0-12c-1.126-.653-2.26-.997-3.5-.997-1.24 0-2.374.344-3.5.997v12c1.126-.652 2.26-.997 3.5-.997 1.24 0 2.374.345 3.5.997m0-12v12" },
  { to: "/tests", label: "Testlar", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { to: "/quality", label: "Sifat nazorati", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0" },
  { to: "/results", label: "Natijalar", icon: "M9 19v-6m6 6V9m-6 10a1 1 0 01-1-1H5a1 1 0 01-1-1v-2a1 1 0 011-1h3a1 1 0 011 1v2zm6-6a1 1 0 011-1h3a1 1 0 011 1v5a1 1 0 01-1 1h-3a1 1 0 01-1-1v-5z" },
  { to: "/planner", label: "Yillik rejalar", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { to: "/reports", label: "Hisobotlar", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { to: "/materials", label: "Materiallar", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { to: "/audit", label: "Audit log", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { to: "/settings", label: "Sozlamalar", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 bg-slate-900 text-white">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 font-bold">AI</div>
          <div>
            <div className="text-sm font-bold">AI Teacher Agent</div>
            <div className="text-xs text-slate-400">O'qituvchi tizimi</div>
          </div>
        </div>
        <nav className="px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-slate-800 px-5 py-4">
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-slate-400">{user?.school_name}</div>
          <button onClick={logout} className="mt-2 text-xs text-slate-300 hover:text-white">
            Chiqish →
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
