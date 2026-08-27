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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold text-white">
            AI
          </div>
          <h1 className="text-xl font-bold">AI Teacher Agent</h1>
          <p className="text-sm text-gray-500">O'qituvchi ishlarini avtomatlashtirish tizimi</p>
        </div>

        <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-2 font-medium ${mode === "login" ? "bg-white shadow" : "text-gray-500"}`}
          >
            Kirish
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-md py-2 font-medium ${mode === "register" ? "bg-white shadow" : "text-gray-500"}`}
          >
            Ro'yxatdan o'tish
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Ismingiz</label>
            <input value={form.name} onChange={set("name")} required className="input" placeholder="Masalan: Sardor" />
          </div>
          {mode === "register" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Maktab nomi</label>
                <input value={form.school_name} onChange={set("school_name")} className="input" placeholder="Masalan: 12-maktab" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Fan</label>
                <input value={form.subject} onChange={set("subject")} className="input" placeholder="Masalan: Tarix" />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Parol</label>
            <input type="password" value={form.password} onChange={set("password")} required className="input" />
          </div>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Yuklanmoqda..." : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
          </button>
        </form>

        <style>{` .input{width:100%;border-radius:.5rem;border:1px solid #e2e8f0;padding:.55rem .75rem;font-size:.9rem;} .input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15);} `}</style>
      </div>
    </div>
  );
}
