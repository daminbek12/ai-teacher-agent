import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Input, Textarea, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Materials() {
  const toast = useToast();
  const [materials, setMaterials] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", class_id: "" });

  const load = async () => {
    const [m, c] = await Promise.all([api("/materials"), api("/classes")]);
    setMaterials(m);
    setClasses(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const m = await api("/materials", { method: "POST", body: { ...form, class_id: form.class_id ? Number(form.class_id) : null } });
      setMaterials((p) => [m, ...p]);
      setShowModal(false);
      setForm({ title: "", content: "", class_id: "" });
      toast.success("Material saqlandi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    const m = materials.find((x) => x.id === id);
    const ok = await toast.confirm(`"${m?.title}" materialini o'chirishni xohlaysizmi?`, { title: "Materialni o'chirish", danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await api(`/materials/${id}`, { method: "DELETE" });
      setMaterials((p) => p.filter((m) => m.id !== id));
      toast.success("Material o'chirildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Materiallar</h1>
          <p className="mt-1 text-body-sm">Darsliklar, konspektlar va o'quv materiallari bazasi</p>
        </div>
        <Button onClick={() => setShowModal(true)} icon="M12 4v16m8-8H4">Material qo'shish</Button>
      </div>

      {materials.length === 0 ? (
        <Card>
          <Empty
            icon="data"
            text="Materiallar hali yo'q. Konspekt yoki darslik matnini qo'shib boshlang."
            action={<Button size="sm" onClick={() => setShowModal(true)}>Material qo'shish</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {materials.map((m, i) => (
            <Card key={m.id} className="stagger-item" >
              <div style={{ animationDelay: `${i * 40}ms` }}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">{m.title}</h3>
                  <button
                    onClick={() => remove(m.id)}
                    aria-label={`${m.title} materialini o'chirish`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.class_name && <Badge color="primary">{m.class_name}</Badge>}
                  <Badge color="neutral">{m.source_type}</Badge>
                </div>
                <pre className="scrollbar-thin max-h-32 overflow-hidden whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm text-slate-600">{m.content}</pre>
                <div className="mt-2 text-caption"><time>{m.created_at?.slice(0, 10)}</time></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi material">
        <form onSubmit={create} className="space-y-4">
          <Field label="Sarlavha" htmlFor="mat-title">
            <Input id="mat-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: 7-sinf tarix darsligi" />
          </Field>
          <Field label="Sinf (ixtiyoriy)" htmlFor="mat-class">
            <select id="mat-class" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 transition-colors hover:border-stone-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100">
              <option value="">Barcha sinflar</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Matn" hint="Keyingi testlar shu materiallarga asoslanadi" htmlFor="mat-content">
            <Textarea id="mat-content" rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>
    </div>
  );
}
