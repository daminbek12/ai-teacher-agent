import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Modal, Field, Input, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Classes() {
  const toast = useToast();
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
    try {
      const cls = await api("/classes", { method: "POST", body: form });
      setClasses((p) => [...p, cls]);
      setShowNewClass(false);
      setForm({ name: "", subject: "" });
      toast.success(`"${cls.name}" sinfi yaratildi`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const createStudent = async (e) => {
    e.preventDefault();
    try {
      const st = await api("/students", { method: "POST", body: { ...studentForm, class_id: selClass.id } });
      setStudents((p) => [...p, st]);
      setShowNewStudent(false);
      setStudentForm({ first_name: "", last_name: "" });
      toast.success(`${st.first_name} o'quvchi qo'shildi`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteStudent = async (id) => {
    const st = students.find((s) => s.id === id);
    const ok = await toast.confirm(`${st?.first_name} ${st?.last_name} o'quvchini o'chirishni tasdiqlaysizmi?`, { title: "O'quvchini o'chirish", danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await api(`/students/${id}`, { method: "DELETE" });
      setStudents((p) => p.filter((s) => s.id !== id));
      toast.success("O'quvchi o'chirildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportStudents = async (cls) => {
    const list = students.filter((s) => s.class_id === cls.id);
    const lines = ["Ism, Familiya"];
    list.forEach((s) => lines.push(`${s.first_name}, ${s.last_name}`));
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `${cls.name}-oquvchilar.csv`);
    toast.success(`${list.length} o'quvchi CSV formatda yuklandi`);
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Sinflar</h1>
          <p className="mt-1 text-body-sm">Sinf va o'quvchilar boshqaruvi</p>
        </div>
        <Button onClick={() => setShowNewClass(true)} icon="M12 4v16m8-8H4">Yangi sinf</Button>
      </div>

      {classes.length === 0 ? (
        <Card>
          <Empty
            icon="data"
            text="Sinflar hali yo'q. Birinchi sinfingizni qo'shib boshlang."
            action={<Button size="sm" onClick={() => setShowNewClass(true)}>Sinf qo'shish</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            {classes.map((cls, i) => {
              const count = students.filter((s) => s.class_id === cls.id).length;
              const selected = selClass?.id === cls.id;
              return (
                <button
                  key={cls.id}
                  onClick={() => setSelClass(cls)}
                  aria-current={selected ? "true" : undefined}
                  className={`stagger-item w-full rounded-xl border bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${selected ? "border-primary-600 ring-2 ring-primary-100" : "border-stone-200 hover:border-primary-300"}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-900">{cls.name}</div>
                    <Badge color="primary">{count} o'quvchi</Badge>
                  </div>
                  <div className="mt-1 text-body-sm">{cls.subject || "Fan kiritilmagan"}</div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            {selClass ? (
              <Card
                title={`${selClass.name} — o'quvchilar`}
                subtitle={selClass.subject || ""}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportStudents(selClass)}>CSV eksport</Button>
                    <Button size="sm" onClick={() => setShowNewStudent(true)}>+ O'quvchi</Button>
                  </div>
                }
              >
                {students.filter((s) => s.class_id === selClass.id).length === 0 ? (
                  <Empty
                    icon="students"
                    text="Bu sinfda hali o'quvchilar yo'q. Birinchi o'quvchini qo'shing."
                    action={<Button size="sm" variant="secondary" onClick={() => setShowNewStudent(true)}>O'quvchi qo'shish</Button>}
                  />
                ) : (
                  <div className="divide-y divide-stone-100">
                    {students
                      .filter((s) => s.class_id === selClass.id)
                      .map((s) => (
                        <div key={s.id} className="group flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700" aria-hidden="true">
                              {s.first_name[0]}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-800">{s.first_name} {s.last_name}</div>
                              <div className="text-caption">Davomat: {s.attendance}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteStudent(s.id)}
                            className="flex min-h-[36px] items-center rounded-md px-2 text-xs font-medium text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                            aria-label={`${s.first_name} ${s.last_name} o'quvchisini o'chirish`}
                          >
                            O'chirish
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            ) : (
              <Card>
                <Empty icon="students" text="O'quvchilarni ko'rish uchun chapdan sinf tanlang." />
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal open={showNewClass} onClose={() => setShowNewClass(false)} title="Yangi sinf">
        <form onSubmit={createClass} className="space-y-4">
          <Field label="Sinf nomi" htmlFor="cls-name">
            <Input id="cls-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masalan: 7-A" />
          </Field>
          <Field label="Fan" htmlFor="cls-subject">
            <Input id="cls-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Masalan: Tarix" />
          </Field>
          <Button type="submit" className="w-full">Saqlash</Button>
        </form>
      </Modal>

      <Modal open={showNewStudent} onClose={() => setShowNewStudent(false)} title={`${selClass?.name} — yangi o'quvchi`}>
        <form onSubmit={createStudent} className="space-y-4">
          <Field label="Ism" htmlFor="st-first">
            <Input id="st-first" required value={studentForm.first_name} onChange={(e) => setStudentForm({ ...studentForm, first_name: e.target.value })} />
          </Field>
          <Field label="Familiya" htmlFor="st-last">
            <Input id="st-last" value={studentForm.last_name} onChange={(e) => setStudentForm({ ...studentForm, last_name: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full">Qo'shish</Button>
        </form>
      </Modal>
    </div>
  );
}
