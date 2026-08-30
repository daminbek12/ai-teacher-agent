import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, Spinner, Empty } from "../components/ui.jsx";

const statusColors = { pending: "amber", in_progress: "blue", done: "green" };
const statusLabels = { pending: "Kutilmoqda", in_progress: "Jarayonda", done: "Tugallangan" };
const subjects = ["O'zbekiston tarixi", "Jahon tarixi", "Tarix"];

export default function Topics() {
  const [topics, setTopics] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ class_id: "", title: "", description: "", subject: "O'zbekiston tarixi" });
  const [bulk, setBulk] = useState({ class_id: "", text: "", subject: "O'zbekiston tarixi" });

  const load = async () => {
    const [t, c] = await Promise.all([api("/topics"), api("/classes")]);
    setTopics(t);
    setClasses(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const topic = await api("/topics", { method: "POST", body: form });
    setTopics((p) => [...p, topic]);
    setShowModal(false);
    setForm({ class_id: "", title: "", description: "", subject: "O'zbekiston tarixi" });
  };

  const createBulk = async (e) => {
    e.preventDefault();
    const titles = bulk.text.split("\n").map((t) => t.trim()).filter(Boolean);
    await api("/topics/bulk", { method: "POST", body: { class_id: Number(bulk.class_id), titles, subject: bulk.subject } });
    await load();
    setShowBulk(false);
    setBulk({ class_id: "", text: "", subject: "O'zbekiston tarixi" });
  };

  const setStatus = async (id, status) => {
    await api(`/topics/${id}`, { method: "PUT", body: { status } });
    setTopics((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  const remove = async (id) => {
    if (!confirm("Mavzuni o'chirish?")) return;
    await api(`/topics/${id}`, { method: "DELETE" });
    setTopics((p) => p.filter((t) => t.id !== id));
  };

  if (loading) return <Spinner />;

  const byClass = classes.map((c) => ({
    ...c,
    topics: topics.filter((t) => t.class_id === c.id),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mavzular rejasi</h1>
          <p className="text-sm text-gray-500">O'quv dasturidagi mavzular — agent testlarni shularga mos tuzadi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}>Ommaviy qo'shish</Button>
          <Button onClick={() => setShowModal(true)}>+ Mavzu</Button>
        </div>
      </div>

      {classes.length === 0 ? (
        <Card><Empty text="Avval sinf qo'shing (Sinflar sahifasi)" /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {byClass.map((cls) => (
            <Card key={cls.id} title={cls.name} subtitle={cls.subject || ""}>
              {cls.topics.length === 0 ? (
                <Empty text="Bu sinfda mavzular yo'q" />
              ) : (
                <div className="space-y-2">
                  {cls.topics.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {t.title}
                          {t.subject && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{t.subject}</span>}
                        </div>
                        {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={t.status}
                          onChange={(e) => setStatus(t.id, e.target.value)}
                          className="w-auto !px-2 !py-1 text-xs"
                        >
                          {Object.entries(statusLabels).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </Select>
                        <button onClick={() => remove(t.id)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi mavzu">
        <form onSubmit={create} className="space-y-3">
          <Field label="Sinf">
            <Select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Mavzu nomi">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Amir Temur davlati" />
          </Field>
          <Field label="Fan">
            <Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Tavsif (ixtiyoriy)">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>

      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="Mavzularni ommaviy qo'shish">
        <form onSubmit={createBulk} className="space-y-3">
          <Field label="Sinf">
            <Select required value={bulk.class_id} onChange={(e) => setBulk({ ...bulk, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Mavzular (har biri alohida qatorda)">
            <textarea
              required
              rows={8}
              value={bulk.text}
              onChange={(e) => setBulk({ ...bulk, text: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder={"Amir Temur davlati\nTemuriylar sulolasi\nJahongir Mirzo\n..."}
            />
          </Field>
          <Field label="Fan">
            <Select value={bulk.subject} onChange={(e) => setBulk({ ...bulk, subject: e.target.value })}>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Button type="submit" className="w-full">Qo'shish</Button>
        </form>
      </Modal>
    </div>
  );
}
