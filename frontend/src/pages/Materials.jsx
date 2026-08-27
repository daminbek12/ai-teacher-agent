import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Input, Textarea, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function Materials() {
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
    const m = await api("/materials", { method: "POST", body: { ...form, class_id: form.class_id ? Number(form.class_id) : null } });
    setMaterials((p) => [m, ...p]);
    setShowModal(false);
    setForm({ title: "", content: "", class_id: "" });
  };

  const remove = async (id) => {
    if (!confirm("Materialni o'chirish?")) return;
    await api(`/materials/${id}`, { method: "DELETE" });
    setMaterials((p) => p.filter((m) => m.id !== id));
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materiallar</h1>
          <p className="text-sm text-gray-500">Darsliklar, konspektlar va o'quv materiallari bazasi</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Material qo'shish</Button>
      </div>

      {materials.length === 0 ? (
        <Card><Empty text="Materiallar yo'q. 'Material qo'shish' tugmasini bosing." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {materials.map((m) => (
            <Card key={m.id}>
              <div className="mb-2 flex items-start justify-between">
                <h3 className="font-semibold text-gray-800">{m.title}</h3>
                <button onClick={() => remove(m.id)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
              </div>
              <div className="mb-2 flex gap-2">
                {m.class_name && <Badge color="indigo">{m.class_name}</Badge>}
                <Badge color="gray">{m.source_type}</Badge>
              </div>
              <pre className="max-h-32 overflow-hidden whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{m.content}</pre>
              <div className="mt-2 text-xs text-gray-400">{m.created_at?.slice(0, 10)}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Yangi material">
        <form onSubmit={create} className="space-y-3">
          <Field label="Sarlavha">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: 7-sinf tarix darsligi" />
          </Field>
          <Field label="Sinf (ixtiyoriy)">
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Barcha sinflar</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Matn" hint="Keyingi testlar shu materiallarga asoslanadi">
            <Textarea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>
    </div>
  );
}
