import React, { useEffect, useRef, useState } from "react";

export function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-card transition-shadow duration-200 hover:shadow-card-hover ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <div>
            {title && <h3 className="text-h3">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-caption text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const statIconColors = {
  primary: "bg-primary-50 text-primary-700",
  accent: "bg-accent-50 text-accent-600",
  success: "bg-success-50 text-success-700",
  danger: "bg-danger-50 text-danger-600",
  neutral: "bg-slate-100 text-slate-600",
};

export function StatCard({ label, value, sub, color = "primary", icon, trend, spark = [] }) {
  const positive = typeof trend === "number" ? trend >= 0 : null;
  const points = spark.length > 1 ? buildSparkPath(spark) : null;
  return (
    <div className="group rounded-xl border border-stone-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`mb-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${statIconColors[color] || statIconColors.primary}`}>
            {icon && <Icon path={icon} className="h-3.5 w-3.5" />}
            {label}
          </div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          {sub && <div className="mt-1 text-caption">{sub}</div>}
        </div>
        {points && (
          <svg viewBox={`0 0 ${spark.length * 8} 24`} className="h-8 w-20 shrink-0" aria-hidden="true">
            <path d={points.line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-400" />
          </svg>
        )}
      </div>
      {trend != null && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-success-600" : "text-danger-600"}`} aria-label={`${positive ? "o'sish" : "kamayish"} ${Math.abs(trend)}%`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={positive ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
          </svg>
          {Math.abs(trend)}% {positive ? "o'sish" : "kamayish"}
        </div>
      )}
    </div>
  );
}

function buildSparkPath(values) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = 8;
  const pts = values.map((v, i) => [i * step + 1, 22 - ((v - min) / range) * 20]);
  return { line: pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") };
}

const buttonVariants = {
  primary: "bg-primary-700 text-white shadow-sm hover:bg-primary-800 active:bg-primary-900",
  secondary: "bg-primary-50 text-primary-800 hover:bg-primary-100 active:bg-primary-200",
  outline: "border border-stone-300 bg-white text-slate-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 active:bg-primary-100",
  ghost: "text-primary-700 hover:bg-primary-50 active:bg-primary-100",
  danger: "bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-700",
  success: "bg-success-600 text-white shadow-sm hover:bg-success-700 active:bg-success-700",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  loading = false,
  icon,
  type = "button",
  ...props
}) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs min-h-[32px]",
    md: "px-4 py-2 text-sm min-h-[40px]",
    lg: "px-5 py-2.5 text-sm min-h-[44px]",
  };
  return (
    <button
      type={type}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:pointer-events-none disabled:opacity-50 ${buttonVariants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
      ) : (
        icon && <Icon path={icon} className="h-4 w-4 shrink-0" />
      )}
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const panelRef = useRef(null);
  const titleId = useIdSafe();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevActive = document.activeElement;
    const t = setTimeout(() => panelRef.current?.querySelector("input:not([type=hidden]), textarea, select")?.focus(), 50);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) trapFocus(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      if (prevActive instanceof HTMLElement) prevActive.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-16 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] flex flex-col rounded-t-2xl bg-white shadow-overlay animate-scale-in sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <h3 id={titleId} className="text-h3 truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-stone-100 hover:text-slate-600"
          >
            <Icon path="M6 18L18 6M6 6l12 12" className="h-5 w-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

let idCounter = 0;
function useIdSafe() {
  const [id] = useState(() => `modal-title-${++idCounter}`);
  return id;
}

function trapFocus(e, container) {
  const focusables = container.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const badgeColors = {
  gray: "bg-stone-100 text-slate-600",
  neutral: "bg-stone-100 text-slate-600",
  green: "bg-success-50 text-success-700",
  success: "bg-success-50 text-success-700",
  amber: "bg-warning-50 text-warning-700",
  warning: "bg-warning-50 text-warning-700",
  red: "bg-danger-50 text-danger-700",
  danger: "bg-danger-50 text-danger-700",
  blue: "bg-primary-50 text-primary-700",
  primary: "bg-primary-50 text-primary-700",
  orange: "bg-warning-50 text-warning-700",
  purple: "bg-primary-50 text-primary-700",
  indigo: "bg-primary-50 text-primary-700",
};

export function Badge({ children, color = "gray", className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColors[color] || badgeColors.gray} ${className}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint, htmlFor }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-caption text-slate-500">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition-colors duration-150 hover:border-stone-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-stone-50 disabled:text-slate-400";

export function Input({ id, className = "", ...props }) {
  return <input id={id} {...props} className={`${inputClass} ${className}`} />;
}

export function Select({ id, children, className = "", ...props }) {
  return (
    <select id={id} {...props} className={`${inputClass} cursor-pointer ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({ id, className = "", ...props }) {
  return <textarea id={id} {...props} className={`${inputClass} min-h-[80px] ${className}`} />;
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10" role="status" aria-label="Yuklanmoqda">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-100 border-t-primary-700"></div>
    </div>
  );
}

const emptyIcons = {
  default: "M20 13V6a2 2 0 00-2-2h-3.5a2 2 0 00-1.7 1L12 8h-2a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-1M16 17a2 2 0 104 0 2 2 0 10-4 0z",
  data: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  search: "M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z",
  students: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zm10 14v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
};

export function Empty({ text, icon = "default", action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-slate-400" aria-hidden="true">
        <Icon path={emptyIcons[icon] || emptyIcons.default} className="h-6 w-6" />
      </div>
      <div className="max-w-xs text-caption text-slate-500">{text}</div>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-stone-100 ${className}`} aria-hidden="true">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Yuklanmoqda">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-stone-200 p-5">
            <Skeleton className="mb-3 h-6 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-stone-200 p-5">
            <Skeleton className="mb-4 h-5 w-40" />
            {[0, 1, 2].map((j) => <Skeleton key={j} className="mb-3 h-10 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Icon({ path, className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}
