import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function Classes() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selClass, setSelClass] = useState(null);
  const [showNewClass, setShowNewClass] = useState(false);
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "" });
  const [studentForm, setStudentForm] = useState({ first_name: "", last_name: "" });

  const load = async () => {
    const [c, s] = await Promise.all([api("/classes"), api("/students")]);
    setClasses(c);
    setStudents(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createClass = async (e) => {
    e.preventDefault();
    const cls = await api("/classes", { method: "POST", body: form });
    setClasses((p) => [...p, cls]);
    setShowNewClass(false);
    setForm({ name: "", subject: "" });
  };

  const createStudent = async (e) => {
    e.preventDefault();
    const st = await api("/students", { method: "POST", body: { ...studentForm, class_id: selClass.id } });
    setStudents((p) => [...p, st]);
    setShowNewStudent(false);
    setStudentForm({ first_name: "", last_name: "" });
  };

  const deleteStudent = async (id) => {
    if (!confirm("O'quvchini o'chirishni tasdiqlaysizmi?")) return;
    await api(`/students/${id}`, { method: "DELETE" });
    setStudents((p) => p.filter((s) => s.id !== id));
  };

  const exportStudents = async (cls) => {
    const list = students.filter((s) => s.class_id === cls.id);
    const lines = ["Ism, Familiya"];
    list.forEach((s) => lines.push(`${s.first_name}, ${s.last_name}`));
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `${cls.name}-oquvchilar.csv`);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sinflar</h1>
          <p className="text-sm text-gray-500">Sinf va o'quvchilar boshqaruvi</p>
        </div>
        <Button onClick={() => setShowNewClass(true)}>+ Yangi sinf</Button>
      </div>

      {classes.length === 0 ? (
        <Card>
          <Empty text="Sinflar yo'q. 'Yangi sinf' tugmasini bosing." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            {classes.map((cls) => {
              const count = students.filter((s) => s.class_id === cls.id).length;
              return (
                <div
                  key={cls.id}
                  onClick={() => setSelClass(cls)}
                  className={`cursor-pointer rounded-xl border bg-white p-4 transition ${selClass?.id === cls.id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-200 hover:border-indigo-300"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-gray-900">{cls.name}</div>
                    <Badge color="indigo">{count} o'quvchi</Badge>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{cls.subject || "Fan kiritilmagan"}</div>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            {selClass ? (
              <Card
                title={`${selClass.name} — o'quvchilar`}
                subtitle={selClass.subject || ""}
                action={
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportStudents(selClass)}>CSV eksport</Button>
                    <Button size="sm" onClick={() => setShowNewStudent(true)}>+ O'quvchi</Button>
                  </div>
                }
              >
                {students.filter((s) => s.class_id === selClass.id).length === 0 ? (
                  <Empty text="Bu sinfda hali o'quvchilar yo'q" />
                ) : (
                  <div className="divide-y divide-gray-100">
                    {students
                      .filter((s) => s.class_id === selClass.id)
                      .map((s, i) => (
                        <div key={s.id} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                              {s.first_name[0]}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-800">{s.first_name} {s.last_name}</div>
                              <div className="text-xs text-gray-400">Davomat: {s.attendance}</div>
                            </div>
                          </div>
                          <button onClick={() => deleteStudent(s.id)} className="text-xs text-rose-500 hover:text-rose-700">
                            O'chirish
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            ) : (
              <Card>
                <Empty text="O'quvchilarni ko'rish uchun sinf tanlang" />
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal open={showNewClass} onClose={() => setShowNewClass(false)} title="Yangi sinf">
        <form onSubmit={createClass} className="space-y-3">
          <Field label="Sinf nomi">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masalan: 7-A" />
          </Field>
          <Field label="Fan">
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Masalan: Tarix" />
          </Field>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>

      <Modal open={showNewStudent} onClose={() => setShowNewStudent(false)} title={`${selClass?.name} — yangi o'quvchi`}>
        <form onSubmit={createStudent} className="space-y-3">
          <Field label="Ism">
            <Input required value={studentForm.first_name} onChange={(e) => setStudentForm({ ...studentForm, first_name: e.target.value })} />
          </Field>
          <Field label="Familiya">
            <Input value={studentForm.last_name} onChange={(e) => setStudentForm({ ...studentForm, last_name: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full">Qo'shish</Button>
        </form>
      </Modal>
    </div>
  );
}
