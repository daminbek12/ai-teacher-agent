import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, Spinner, Empty } from "../components/ui.jsx";

const typeLabels = {
  topic: "Mavzu testi",
  daily: "Kunlik test",
  weekly: "Haftalik test",
  monthly: "Oylik test",
  diagnostic: "Diagnostik test",
  final: "Yakuniy nazorat",
  individual: "Individual test",
  manual: "Qo'lda kiritilgan",
};

const typeColors = {
  topic: "indigo",
  daily: "cyan",
  weekly: "green",
  monthly: "blue",
  diagnostic: "amber",
  final: "red",
  individual: "purple",
  manual: "gray",
};

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [viewTest, setViewTest] = useState(null);
  const [form, setForm] = useState({
    class_id: "",
    title: "",
    topic: "",
    type: "topic",
    question_count: 20,
    duration_minutes: 25,
    difficulty_easy: 30,
    difficulty_medium: 50,
    difficulty_hard: 20,
    local_only: false,
  });

  const load = async () => {
    const [t, c] = await Promise.all([api("/tests"), api("/classes")]);
    setTests(t);
    setClasses(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const test = await api("/tests", { method: "POST", body: { ...form, class_id: Number(form.class_id) } });
      setTests((p) => [test, ...p]);
      setShowCreate(false);
      setViewTest(test);
    } catch (err) {
      alert(err.message);
    }
  };

  const generateDaily = async () => {
    setDailyBusy(true);
    try {
      const res = await api("/tests/daily", { method: "POST", body: {} });
      if (res.tests?.length) {
        setTests((p) => [...res.tests, ...p]);
        alert(`Kunlik testlar yaratildi: ${res.tests.length} ta`);
      } else {
        alert(res.message || "Bugun uchun kunlik test yaratilmadi");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDailyBusy(false);
    }
  };

  const view = async (id) => {
    const t = await api(`/tests/${id}`);
    setViewTest(t);
  };

  const regenerate = async (id) => {
    const q = await api(`/tests/${id}/generate-questions`, { method: "POST", body: { local_only: true } });
    setViewTest((p) => (p && p.id === id ? { ...p, questions: q.questions } : p));
    alert("Savollar qayta yaratildi");
  };

  const download = async (id, format) => {
    const blob = await api(`/tests/${id}/${format}`, { download: true });
    const test = tests.find((t) => t.id === id) || viewTest;
    downloadBlob(blob, `${test?.title || "test"}.${format}`);
  };

  const remove = async (id) => {
    if (!confirm("Testni o'chirish?")) return;
    await api(`/tests/${id}`, { method: "DELETE" });
    setTests((p) => p.filter((t) => t.id !== id));
    setViewTest(null);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Testlar</h1>
          <p className="text-sm text-gray-500">Avtomatik test yaratish, Word/PDF, baholash</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateDaily} disabled={dailyBusy}>
            {dailyBusy ? "Yaratilmoqda..." : "Kunlik test"}
          </Button>
          <Button onClick={() => setShowCreate(true)}>+ Yangi test</Button>
        </div>
      </div>

      {tests.length === 0 ? (
        <Card><Empty text="Hozircha testlar yo'q. 'Yangi test' tugmasini bosing." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tests.map((t) => (
            <Card key={t.id} className="cursor-pointer hover:shadow-md" >
              <div onClick={() => view(t.id)}>
                <div className="mb-2 flex items-center justify-between">
                  <Badge color={typeColors[t.type] || "gray"}>{typeLabels[t.type] || t.type}</Badge>
                  <span className="text-xs text-gray-400">{t.created_at?.slice(0, 10)}</span>
                </div>
                <div className="mb-2 font-semibold text-gray-900">{t.title}</div>
                <div className="mb-3 text-xs text-gray-500">
                  {t.class_name} · {t.question_count} savol · {t.duration_minutes} daqiqa
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-500">
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5">Oson {t.difficulty_easy}%</span>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5">O'rta {t.difficulty_medium}%</span>
                  <span className="rounded bg-rose-50 px-1.5 py-0.5">Qiyin {t.difficulty_hard}%</span>
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                <Button variant="outline" size="sm" onClick={() => download(t.id, "docx")}>Word</Button>
                <Button variant="outline" size="sm" onClick={() => download(t.id, "pdf")}>PDF</Button>
                <Button variant="outline" size="sm" onClick={() => download(t.id, "pdf?answers=true")}>PDF+kalit</Button>
                <div className="ml-auto">
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>✕</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Yangi test yaratish" wide>
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Sinf">
              <Select required value={form.class_id} onChange={set("class_id")}>
                <option value="">Sinf tanlang</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Test turi">
              <Select value={form.type} onChange={set("type")}>
                {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Test nomi">
            <Input required value={form.title} onChange={set("title")} placeholder="Masalan: Amir Temur davlati testi" />
          </Field>
          <Field label="Mavzu">
            <Input value={form.topic} onChange={set("topic")} placeholder="Masalan: Amir Temur davlati" />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Savollar soni">
              <Select value={form.question_count} onChange={set("question_count")}>
                {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{n} ta</option>)}
              </Select>
            </Field>
            <Field label="Davomiyligi (daqiqa)">
              <Input type="number" value={form.duration_minutes} onChange={set("duration_minutes")} />
            </Field>
          </div>
          <Field label="Qiyinlik nisbati (%)">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="mb-1 block text-xs text-emerald-600">Oson</span>
                <Input type="number" value={form.difficulty_easy} onChange={set("difficulty_easy")} />
              </div>
              <div>
                <span className="mb-1 block text-xs text-amber-600">O'rta</span>
                <Input type="number" value={form.difficulty_medium} onChange={set("difficulty_medium")} />
              </div>
              <div>
                <span className="mb-1 block text-xs text-rose-600">Qiyin</span>
                <Input type="number" value={form.difficulty_hard} onChange={set("difficulty_hard")} />
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-400">Jami 100% bo'lishi kerak</p>
          </Field>
          <Button type="submit" className="w-full">Test yaratish</Button>
        </form>
      </Modal>

      <Modal open={!!viewTest} onClose={() => setViewTest(null)} title={viewTest?.title} wide>
        {viewTest && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge color={typeColors[viewTest.type] || "gray"}>{typeLabels[viewTest.type] || viewTest.type}</Badge>
              <span className="text-xs text-gray-500">{viewTest.question_count} savol · {viewTest.duration_minutes} daqiqa · {viewTest.class_name}</span>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button variant="success" size="sm" onClick={() => download(viewTest.id, "docx")}>Word yuklab olish</Button>
              <Button variant="success" size="sm" onClick={() => download(viewTest.id, "pdf")}>PDF yuklab olish</Button>
              <Button variant="success" size="sm" onClick={() => download(viewTest.id, "pdf?answers=true")}>PDF + javoblar</Button>
              <Button variant="outline" size="sm" onClick={() => regenerate(viewTest.id)}>Savollarni yangilash</Button>
            </div>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-2">
              {viewTest.questions.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-gray-800">{i + 1}. {q.question_text}</div>
                    <Badge color={q.difficulty === "easy" ? "green" : q.difficulty === "hard" ? "red" : "amber"}>{q.difficulty}</Badge>
                  </div>
                  <div className="grid gap-1 pl-4 text-sm text-gray-600 sm:grid-cols-2">
                    {q.options.map((o) => (
                      <div key={o.letter} className={o.letter === q.correct_answer ? "font-medium text-emerald-700" : ""}>
                        {o.letter}) {o.text} {o.letter === q.correct_answer && "✓"}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
