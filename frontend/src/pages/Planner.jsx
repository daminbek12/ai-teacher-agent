import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Field, Select, Input, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Planner() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planForm, setPlanForm] = useState({ class_id: "", start: "2026-09-01", end: "2027-05-31" });
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    const [c, h] = await Promise.all([api("/classes"), api("/holidays")]);
    setClasses(c);
    setHolidays(h);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generatePlan = async () => {
    if (!planForm.class_id) return toast.warning("Avval sinfni tanlang");
    setBusy(true);
    try {
      const result = await api("/plan/annual", { method: "POST", body: planForm });
      setPlan(result);
      toast.success(`Yillik reja tuzildi: ${result.plan.length} dars`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const seedHolidays = async () => {
    setSeeding(true);
    try {
      const year = new Date().getFullYear();
      const r = await api("/holidays/seed", { method: "POST", body: { year } });
      toast.success(`Bayramlar qo'shildi: ${r.seeded} ta`);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Yillik rejalar</h1>
        <p className="mt-1 text-body-sm">Dastur + darslik + jadval + ta'tillar asosida avtomatik taqsimot</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Bayramlar va ta'tillar"
          subtitle="Dars kunlari hisobga olinadi"
          action={<Button size="sm" variant="outline" onClick={seedHolidays} loading={seeding}>Standart bayramlar</Button>}
        >
          {holidays.length === 0 ? (
            <Empty
              icon="data"
              text="Bayramlar kiritilmagan. Standart bayramlar tugmasini bosing."
              action={<Button size="sm" variant="secondary" onClick={seedHolidays} loading={seeding}>Standart bayramlar</Button>}
            />
          ) : (
            <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <span className="text-slate-700">{h.name || "Bayram"}</span>
                  <Badge color="warning">{h.date}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Yillik reja yaratish" subtitle="Mavzular dars kunlariga avtomatik taqsimlanadi">
          <Field label="Sinf" htmlFor="plan-class">
            <Select id="plan-class" value={planForm.class_id} onChange={(e) => setPlanForm({ ...planForm, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boshlanish" htmlFor="plan-start">
              <Input id="plan-start" type="date" value={planForm.start} onChange={(e) => setPlanForm({ ...planForm, start: e.target.value })} />
            </Field>
            <Field label="Tugash" htmlFor="plan-end">
              <Input id="plan-end" type="date" value={planForm.end} onChange={(e) => setPlanForm({ ...planForm, end: e.target.value })} />
            </Field>
          </div>
          <Button onClick={generatePlan} loading={busy} icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2">Yillik rejani tuzish</Button>
        </Card>
      </div>

      {plan && (
        <Card title="Yillik reja natijasi">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-primary-50 p-3 text-center">
              <div className="font-display text-xl font-bold text-primary-700">{plan.plan.length}</div>
              <div className="text-xs font-medium text-primary-600">Jami darslar</div>
            </div>
            <div className="rounded-xl bg-success-50 p-3 text-center">
              <div className="font-display text-xl font-bold text-success-700">{plan.topicsCount}</div>
              <div className="text-xs font-medium text-success-600">Mavzular</div>
            </div>
            <div className="rounded-xl bg-accent-50 p-3 text-center">
              <div className="font-display text-xl font-bold text-accent-700">{plan.lessonDates}</div>
              <div className="text-xs font-medium text-accent-600">Dars kunlari</div>
            </div>
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-stone-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3">#</th><th className="pb-2 pr-3">Sana</th><th className="pb-2 pr-3">Kun</th><th className="pb-2">Mavzu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {plan.plan.slice(0, 80).map((p) => (
                  <tr key={p.lesson_no} className="transition-colors hover:bg-stone-50/60">
                    <td className="py-1.5 pr-3 text-slate-400">{p.lesson_no}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{p.date}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{p.dayName}</td>
                    <td className="py-1.5">
                      {p.status === "done" ? <Badge color="success">{p.topicTitle}</Badge> : <span className="text-slate-700">{p.topicTitle}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.plan.length > 80 && <div className="py-2 text-center text-caption">... yana {plan.plan.length - 80} dars</div>}
          </div>
        </Card>
      )}
    </div>
  );
}
