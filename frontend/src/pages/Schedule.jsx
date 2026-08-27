import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, Spinner, Empty } from "../components/ui.jsx";

const dayNames = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
const days = dayNames.map((name, i) => ({ id: i + 1, name }));

export default function Schedule() {
  const [schedule, setSchedule] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ class_id: "", day_of_week: 1, start_time: "08:00", subject: "" });

  const load = async () => {
    const [s, c] = await Promise.all([api("/schedule"), api("/classes")]);
    setSchedule(s);
    setClasses(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const item = await api("/schedule", { method: "POST", body: form });
    setSchedule((p) => [...p, item]);
    setShowModal(false);
    setForm({ class_id: "", day_of_week: 1, start_time: "08:00", subject: "" });
  };

  const remove = async (id) => {
    if (!confirm("Jadval yozuvini o'chirish?")) return;
    await api(`/schedule/${id}`, { method: "DELETE" });
    setSchedule((p) => p.filter((s) => s.id !== id));
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Haftalik jadval</h1>
          <p className="text-sm text-gray-500">Agent jadval asosida darslarni avtomatik rejalashtiradi</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Dars qo'shish</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {days.map((day) => {
          const lessons = schedule.filter((s) => Number(s.day_of_week) === day.id).sort((a, b) => a.start_time.localeCompare(b.start_time));
          return (
            <Card key={day.id} title={day.name} className="min-h-[120px]">
              {lessons.length === 0 ? (
                <Empty text="Dars yo'q" />
              ) : (
                <div className="space-y-2">
                  {lessons.map((l) => (
                    <div key={l.id} className="group rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <Badge color="indigo">{l.start_time}</Badge>
                        <button onClick={() => remove(l.id)} className="text-xs text-rose-400 opacity-0 transition group-hover:opacity-100">
                          ✕
                        </button>
                      </div>
                      <div className="mt-1 text-sm font-medium text-gray-800">{l.subject || "Dars"}</div>
                      <div className="text-xs text-gray-500">{l.class_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi dars">
        <form onSubmit={create} className="space-y-3">
          <Field label="Sinf">
            <Select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Kun">
            <Select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
              {days.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boshlanish vaqti">
              <Input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="Fan">
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Tarix" />
            </Field>
          </div>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>
    </div>
  );
}
