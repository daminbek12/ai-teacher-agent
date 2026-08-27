import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Field, Select, Input, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function Planner() {
  const [classes, setClasses] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planForm, setPlanForm] = useState({ class_id: "", start: "2026-09-01", end: "2027-05-31" });
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [c, h] = await Promise.all([api("/classes"), api("/holidays")]);
    setClasses(c);
    setHolidays(h);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generatePlan = async () => {
    if (!planForm.class_id) return alert("Sinfni tanlang");
    setBusy(true);
    try {
      const result = await api("/plan/annual", { method: "POST", body: planForm });
      setPlan(result);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const seedHolidays = async () => {
    const year = new Date().getFullYear();
    const r = await api("/holidays/seed", { method: "POST", body: { year } });
    alert(`Bayramlar qo'shildi: ${r.seeded}`);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Yillik rejalar</h1>
        <p className="text-sm text-gray-500">Dastur + darslik + jadval + ta'tillar asosida avtomatik taqsimot</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Bayramlar va ta'tillar" subtitle="Dars kunlari hisobga olinadi" action={<Button size="sm" variant="outline" onClick={seedHolidays}>Standart bayramlar</Button>}>
          {holidays.length === 0 ? (
            <Empty text="Bayramlar kiritilmagan. 'Standart bayramlar' tugmasini bosing." />
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span className="text-gray-700">{h.name || "Bayram"}</span>
                  <Badge color="amber">{h.date}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Yillik reja yaratish" subtitle="Mavzular dars kunlariga avtomatik taqsimlanadi">
          <Field label="Sinf">
            <Select value={planForm.class_id} onChange={(e) => setPlanForm({ ...planForm, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boshlanish">
              <Input type="date" value={planForm.start} onChange={(e) => setPlanForm({ ...planForm, start: e.target.value })} />
            </Field>
            <Field label="Tugash">
              <Input type="date" value={planForm.end} onChange={(e) => setPlanForm({ ...planForm, end: e.target.value })} />
            </Field>
          </div>
          <Button onClick={generatePlan} disabled={busy}>{busy ? "Tuzilmoqda..." : "Yillik rejani tuzish"}</Button>
        </Card>
      </div>

      {plan && (
        <Card title="Yillik reja natijasi" className="mt-6">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-indigo-50 p-3 text-center">
              <div className="text-xl font-bold text-indigo-700">{plan.plan.length}</div>
              <div className="text-xs text-indigo-500">Jami darslar</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <div className="text-xl font-bold text-emerald-700">{plan.topicsCount}</div>
              <div className="text-xs text-emerald-500">Mavzular</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <div className="text-xl font-bold text-amber-700">{plan.lessonDates}</div>
              <div className="text-xs text-amber-500">Dars kunlari</div>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                  <th className="pb-2">#</th><th className="pb-2">Sana</th><th className="pb-2">Kun</th><th className="pb-2">Mavzu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {plan.plan.slice(0, 80).map((p) => (
                  <tr key={p.lesson_no}>
                    <td className="py-1.5 text-gray-400">{p.lesson_no}</td>
                    <td className="py-1.5 text-gray-700">{p.date}</td>
                    <td className="py-1.5 text-gray-500">{p.dayName}</td>
                    <td className="py-1.5">
                      {p.status === "done" ? <Badge color="green">{p.topicTitle}</Badge> : p.topicTitle}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.plan.length > 80 && <div className="py-2 text-center text-xs text-gray-400">... yana {plan.plan.length - 80} dars</div>}
          </div>
        </Card>
      )}
    </div>
  );
}
