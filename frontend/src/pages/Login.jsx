import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", password: "", school_name: "", subject: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.name, form.password);
      } else {
        await register(form);
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const inputClass =
    "w-full min-h-[44px] rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition-colors duration-150 hover:border-stone-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-overlay lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-primary-800 to-primary-950 p-10 lg:flex">
          <div>
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white">AI</div>
            <h2 className="font-display text-2xl font-bold leading-snug text-white">
              O'qituvchining barcha ishi — bitta platformada
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-primary-100">
              Testlar yaratish, dars rejalari, baholash va hisobotlar avtomatlashtirilgan holda boshqariladi.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-primary-100">
            {[
              "AI asosida testlar va savollar generatsiya",
              "Dars jadvali va kunlik testlar avtomatik",
              "O'quvchi natijalari tahlili va tavsiyalar",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-accent-400" aria-hidden="true">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
          <div className="text-xs text-primary-200/60">© 2026 AI Teacher Agent</div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-700 text-xl font-bold text-white shadow-sm lg:hidden">
              AI
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">AI Teacher Agent</h1>
            <p className="mt-1 text-sm text-slate-500">O'qituvchi ishlarini avtomatlashtirish tizimi</p>
          </div>

          <div className="mb-6 flex rounded-lg bg-stone-100 p-1 text-sm" role="tablist" aria-label="Autentifikatsiya rejimi">
            {[
              ["login", "Kirish"],
              ["register", "Ro'yxatdan o'tish"],
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-[40px] flex-1 rounded-md px-4 font-semibold transition-all duration-200 ${
                  mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-name" className="mb-1.5 block text-sm font-medium text-slate-700">Ismingiz</label>
              <input id="login-name" value={form.name} onChange={set("name")} required autoComplete="name" className={inputClass} placeholder="Masalan: Sardor" />
            </div>
            {mode === "register" && (
              <>
                <div>
                  <label htmlFor="login-school" className="mb-1.5 block text-sm font-medium text-slate-700">Maktab nomi</label>
                  <input id="login-school" value={form.school_name} onChange={set("school_name")} autoComplete="organization" className={inputClass} placeholder="Masalan: 12-maktab" />
                </div>
                <div>
                  <label htmlFor="login-subject" className="mb-1.5 block text-sm font-medium text-slate-700">Fan</label>
                  <input id="login-subject" value={form.subject} onChange={set("subject")} className={inputClass} placeholder="Masalan: Tarix" />
                </div>
              </>
            )}
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700">Parol</label>
              <input id="login-password" type="password" value={form.password} onChange={set("password")} required autoComplete={mode === "login" ? "current-password" : "new-password"} className={inputClass} />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary-700 py-2.5 font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primary-800 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50"
            >
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
              {loading ? "Yuklanmoqda..." : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
