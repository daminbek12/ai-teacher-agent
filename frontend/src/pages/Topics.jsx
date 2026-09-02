import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const statusColors = { pending: "warning", in_progress: "primary", done: "success" };
const statusLabels = { pending: "Kutilmoqda", in_progress: "Jarayonda", done: "Tugallangan" };
const subjects = ["O'zbekiston tarixi", "Jahon tarixi", "Tarix"];

export default function Topics() {
  const toast = useToast();
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
    try {
      const topic = await api("/topics", { method: "POST", body: form });
      setTopics((p) => [...p, topic]);
      setShowModal(false);
      setForm({ class_id: "", title: "", description: "", subject: "O'zbekiston tarixi" });
      toast.success("Mavzu qo'shildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const createBulk = async (e) => {
    e.preventDefault();
    const titles = bulk.text.split("\n").map((t) => t.trim()).filter(Boolean);
    if (titles.length === 0) return toast.warning("Kamida bitta mavzu nomini kiriting");
    try {
      await api("/topics/bulk", { method: "POST", body: { class_id: Number(bulk.class_id), titles, subject: bulk.subject } });
      await load();
      setShowBulk(false);
      setBulk({ class_id: "", text: "", subject: "O'zbekiston tarixi" });
      toast.success(`${titles.length} ta mavzu qo'shildi`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await api(`/topics/${id}`, { method: "PUT", body: { status } });
      setTopics((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    const t = topics.find((x) => x.id === id);
    const ok = await toast.confirm(`"${t?.title}" mavzusini o'chirishni xohlaysizmi?`, { title: "Mavzuni o'chirish", danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await api(`/topics/${id}`, { method: "DELETE" });
      setTopics((p) => p.filter((t) => t.id !== id));
      toast.success("Mavzu o'chirildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSkeleton />;

  const byClass = classes.map((c) => ({
    ...c,
    topics: topics.filter((t) => t.class_id === c.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Mavzular rejasi</h1>
          <p className="mt-1 text-body-sm">O'quv dasturidagi mavzular — agent testlarni shularga mos tuzadi</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}>Ommaviy qo'shish</Button>
          <Button onClick={() => setShowModal(true)} icon="M12 4v16m8-8H4">Mavzu</Button>
        </div>
      </div>

      {classes.length === 0 ? (
        <Card>
          <Empty
            icon="data"
            text="Avval sinf qo'shing — mavzular sinfga biriktiriladi."
            action={<Button size="sm" variant="secondary" onClick={() => (window.location.href = "/classes")}>Sinflar sahifasiga o'tish</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {byClass.map((cls) => (
            <Card key={cls.id} title={cls.name} subtitle={cls.subject || ""}>
              {cls.topics.length === 0 ? (
                <Empty
                  icon="data"
                  text="Bu sinfda mavzular yo'q. Darslik yuklang yoki qo'lda qo'shing."
                  action={<Button size="sm" variant="secondary" onClick={() => { setShowModal(true); setForm((p) => ({ ...p, class_id: cls.id })); }}>Mavzu qo'shish</Button>}
                />
              ) : (
                <div className="space-y-2">
                  {cls.topics.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50/50 px-3 py-2.5 transition-colors hover:border-primary-200">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{t.title}</span>
                          {t.subject && <Badge color={t.subject === "Jahon tarixi" ? "accent" : t.subject === "Tarix" ? "neutral" : "primary"}>{t.subject}</Badge>}
                        </div>
                        {t.description && <div className="mt-0.5 text-caption">{t.description}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={t.status}
                          onChange={(e) => setStatus(t.id, e.target.value)}
                          className="w-auto !px-2 !py-1.5 text-xs"
                          aria-label={`${t.title} mavzusi holati`}
                        >
                          {Object.entries(statusLabels).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </Select>
                        <button
                          type="button"
                          onClick={() => remove(t.id)}
                          aria-label={`${t.title} mavzusini o'chirish`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
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
        <form onSubmit={create} className="space-y-4">
          <Field label="Sinf" htmlFor="tp-class">
            <Select id="tp-class" required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Mavzu nomi" htmlFor="tp-title">
            <Input id="tp-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Amir Temur davlati" />
          </Field>
          <Field label="Fan" htmlFor="tp-subject">
            <Select id="tp-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Tavsif (ixtiyoriy)" htmlFor="tp-desc">
            <Input id="tp-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>

      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="Mavzularni ommaviy qo'shish">
        <form onSubmit={createBulk} className="space-y-4">
          <Field label="Sinf" htmlFor="bulk-class">
            <Select id="bulk-class" required value={bulk.class_id} onChange={(e) => setBulk({ ...bulk, class_id: e.target.value })}>
              <option value="">Sinf tanlang</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Fan" htmlFor="bulk-subject">
            <Select id="bulk-subject" value={bulk.subject} onChange={(e) => setBulk({ ...bulk, subject: e.target.value })}>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Mavzular (har biri alohida qatorda)" htmlFor="bulk-text">
            <textarea
              id="bulk-text"
              required
              rows={8}
              value={bulk.text}
              onChange={(e) => setBulk({ ...bulk, text: e.target.value })}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition-colors hover:border-stone-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder={"Amir Temur davlati\nTemuriylar sulolasi\nJahongir Mirzo\n..."}
            />
          </Field>
          <Button type="submit" className="w-full">Qo'shish</Button>
        </form>
      </Modal>
    </div>
  );
}
