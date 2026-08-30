import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const dayNames = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const days = dayNames.map((name, i) => ({ id: i + 1, name }));

export default function Schedule() {
  const toast = useToast();
  const [schedule, setSchedule] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ class_id: "", day_of_week: 1, start_time: "08:00", subject: "" });

  const todayIdx = new Date().getDay();
  const todayDow = todayIdx === 0 ? 7 : todayIdx;

  const load = async () => {
    const [s, c] = await Promise.all([api("/schedule"), api("/classes")]);
    setSchedule(s);
    setClasses(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const item = await api("/schedule", { method: "POST", body: form });
      setSchedule((p) => [...p, item]);
      setShowModal(false);
      setForm({ class_id: "", day_of_week: 1, start_time: "08:00", subject: "" });
      toast.success("Dars jadvalga qo'shildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    const item = schedule.find((s) => s.id === id);
    const ok = await toast.confirm(`"${item?.class_name} — ${item?.start_time}" darsini jadvaldan o'chirishni xohlaysizmi?`, { title: "Jadvaldan o'chirish", danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await api(`/schedule/${id}`, { method: "DELETE" });
      setSchedule((p) => p.filter((s) => s.id !== id));
      toast.success("Jadval yozuvi o'chirildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Haftalik jadval</h1>
          <p className="mt-1 text-body-sm">Agent jadval asosida darslarni avtomatik rejalashtiradi</p>
        </div>
        <Button onClick={() => setShowModal(true)} icon="M12 4v16m8-8H4">Dars qo'shish</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {days.map((day) => {
          const lessons = schedule.filter((s) => Number(s.day_of_week) === day.id).sort((a, b) => a.start_time.localeCompare(b.start_time));
          const isToday = day.id === todayDow;
          return (
            <Card
              key={day.id}
              title={day.name}
              className={`min-h-[120px] ${isToday ? "!border-primary-300 ring-1 ring-primary-100" : ""}`}
              action={isToday ? <Badge color="primary">Bugun</Badge> : null}
            >
              {lessons.length === 0 ? (
                <Empty text="Bu kunda dars yo'q" />
              ) : (
                <div className="space-y-2">
                  {lessons.map((l) => (
                    <div key={l.id} className="group relative rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 transition-colors hover:border-primary-200">
                      <div className="flex items-center justify-between gap-2">
                        <Badge color="primary">{l.start_time}</Badge>
                        <button
                          onClick={() => remove(l.id)}
                          aria-label={`${day.name} ${l.start_time} ${l.subject || "dars"} yozuvini o'chirish`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 opacity-100 transition-colors hover:bg-danger-50 hover:text-danger-600 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-1 pr-2 text-sm font-medium text-slate-800">{l.subject || "Dars"}</div>
                      <div className="text-caption">{l.class_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi dars">
        <form onSubmit={create} className="space-y-4">
          <Field label="Sinf" htmlFor="sch-class">
            <Select id="sch-class" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Kun" htmlFor="sch-day">
            <Select id="sch-day" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })}>
              {days.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boshlanish vaqti" htmlFor="sch-time">
              <Input id="sch-time" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="Fan" htmlFor="sch-subject">
              <Input id="sch-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Masalan: O'zbekiston tarixi" />
            </Field>
          </div>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>
    </div>
  );
}
