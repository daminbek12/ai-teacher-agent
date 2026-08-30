import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Modal, Field, Input, Select, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

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
  topic: "primary",
  daily: "success",
  weekly: "accent",
  monthly: "warning",
  diagnostic: "neutral",
  final: "danger",
  individual: "primary",
  manual: "neutral",
};

export default function Tests() {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [classes, setClasses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [viewTest, setViewTest] = useState(null);
  const [form, setForm] = useState({
    class_id: "",
    title: "",
    topic: "",
    subject: "",
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

  const onClassChange = async (e) => {
    const classId = e.target.value;
    setForm((p) => ({ ...p, class_id: classId, topic: "" }));
    if (!classId) return setTopics([]);
    try {
      const list = await api(`/topics?class_id=${classId}`);
      setTopics(list);
    } catch {
      setTopics([]);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      const topicInfo = topics.find((t) => t.title === form.topic);
      const test = await api("/tests", {
        method: "POST",
        body: { ...form, class_id: Number(form.class_id), subject: topicInfo?.subject || form.subject || "" },
      });
      setTests((p) => [test, ...p]);
      setShowCreate(false);
      setViewTest(test);
      toast.success(`"${test.title}" testi yaratildi`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const generateDaily = async () => {
    setDailyBusy(true);
    try {
      const res = await api("/tests/daily", { method: "POST", body: {} });
      if (res.tests?.length) {
        setTests((p) => [...res.tests, ...p]);
        toast.success(`Kunlik testlar yaratildi: ${res.tests.length} ta`);
      } else {
        toast.info(res.message || "Bugun uchun kunlik test yaratilmadi");
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDailyBusy(false);
    }
  };

  const view = async (id) => {
    const t = await api(`/tests/${id}`);
    setViewTest(t);
  };

  const regenerate = async (id) => {
    try {
      const q = await api(`/tests/${id}/generate-questions`, { method: "POST", body: { local_only: true } });
      setViewTest((p) => (p && p.id === id ? { ...p, questions: q.questions } : p));
      toast.success("Savollar qayta yaratildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const download = async (id, format) => {
    try {
      const blob = await api(`/tests/${id}/${format}`, { download: true });
      const test = tests.find((t) => t.id === id) || viewTest;
      downloadBlob(blob, `${test?.title || "test"}.${format.split("?")[0]}`);
    } catch (err) {
      toast.error("Yuklab olishda xatolik");
    }
  };

  const remove = async (id) => {
    const ok = await toast.confirm(`"${tests.find((t) => t.id === id)?.title}" testini o'chirishni xohlaysizmi?`, { title: "Testni o'chirish", danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await api(`/tests/${id}`, { method: "DELETE" });
      setTests((p) => p.filter((t) => t.id !== id));
      setViewTest(null);
      toast.success("Test o'chirildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Testlar</h1>
          <p className="mt-1 text-body-sm">Avtomatik test yaratish, Word/PDF, baholash</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateDaily} loading={dailyBusy}>Kunlik test</Button>
          <Button onClick={() => setShowCreate(true)} icon="M12 4v16m8-8H4">Yangi test</Button>
        </div>
      </div>

      {tests.length === 0 ? (
        <Card>
          <Empty
            icon="data"
            text="Hozircha testlar yo'q. Kunlik test yarating yoki yangi test qo'shing."
            action={<Button size="sm" onClick={() => setShowCreate(true)}>Birinchi testni yaratish</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tests.map((t, i) => (
            <Card key={t.id} className="stagger-item cursor-pointer">
              <div onClick={() => view(t.id)} style={{ animationDelay: `${i * 40}ms` }}>
                <div className="mb-2 flex items-center justify-between">
                  <Badge color={typeColors[t.type] || "neutral"}>{typeLabels[t.type] || t.type}</Badge>
                  <time className="text-caption">{t.created_at?.slice(0, 10)}</time>
                </div>
                <div className="mb-2 min-h-[40px] font-semibold text-slate-900">{t.title}</div>
                <div className="mb-3 text-caption">
                  {t.class_name} · {t.question_count} savol · {t.duration_minutes} daqiqa
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded bg-success-50 px-2 py-0.5 font-medium text-success-700">Oson {t.difficulty_easy}%</span>
                  <span className="rounded bg-warning-50 px-2 py-0.5 font-medium text-warning-700">O'rta {t.difficulty_medium}%</span>
                  <span className="rounded bg-danger-50 px-2 py-0.5 font-medium text-danger-700">Qiyin {t.difficulty_hard}%</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                <Button variant="outline" size="sm" onClick={() => download(t.id, "docx")}>Word</Button>
                <Button variant="outline" size="sm" onClick={() => download(t.id, "pdf")}>PDF</Button>
                <Button variant="outline" size="sm" onClick={() => download(t.id, "pdf?answers=true")}>PDF+kalit</Button>
                <div className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(t.id)}
                    aria-label="Testni o'chirish"
                    className="!text-danger-600 hover:!bg-danger-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </Button>
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
            <Select required value={form.class_id} onChange={onClassChange}>
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
            {form.class_id ? (
              <Select value={form.topic} onChange={set("topic")}>
                <option value="">Mavzu tanlang</option>
                {Object.entries(
                  topics.reduce((acc, t) => {
                    const s = t.subject || "Tarix";
                    (acc[s] = acc[s] || []).push(t);
                    return acc;
                  }, {})
                ).map(([subj, list]) => (
                  <optgroup key={subj} label={subj}>
                    {list.map((t) => <option key={t.id} value={t.title}>{t.title}</option>)}
                  </optgroup>
                ))}
              </Select>
            ) : (
              <Input value={form.topic} onChange={set("topic")} placeholder="Avval sinf tanlang" disabled />
            )}
            {form.class_id && topics.length === 0 && (
              <p className="mt-1.5 text-xs font-medium text-warning-700">Bu sinf uchun mavzular bazada topilmadi (Mavzular bo'limidan qo'shing)</p>
            )}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <span className="mb-1 block text-xs font-semibold text-success-700">Oson</span>
                <Input type="number" value={form.difficulty_easy} onChange={set("difficulty_easy")} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-warning-700">O'rta</span>
                <Input type="number" value={form.difficulty_medium} onChange={set("difficulty_medium")} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-danger-700">Qiyin</span>
                <Input type="number" value={form.difficulty_hard} onChange={set("difficulty_hard")} />
              </div>
            </div>
            <p className="mt-1.5 text-caption">Jami 100% bo'lishi kerak</p>
          </Field>
          <Button type="submit" className="w-full" icon="M12 4v16m8-8H4">Test yaratish</Button>
        </form>
      </Modal>

      <Modal open={!!viewTest} onClose={() => setViewTest(null)} title={viewTest?.title} wide>
        {viewTest && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge color={typeColors[viewTest.type] || "neutral"}>{typeLabels[viewTest.type] || viewTest.type}</Badge>
              <span className="text-caption">{viewTest.question_count} savol · {viewTest.duration_minutes} daqiqa · {viewTest.class_name}</span>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button variant="success" size="sm" onClick={() => download(viewTest.id, "docx")}>Word yuklab olish</Button>
              <Button variant="success" size="sm" onClick={() => download(viewTest.id, "pdf")}>PDF yuklab olish</Button>
              <Button variant="success" size="sm" onClick={() => download(viewTest.id, "pdf?answers=true")}>PDF + javoblar</Button>
              <Button variant="outline" size="sm" onClick={() => regenerate(viewTest.id)}>Savollarni yangilash</Button>
            </div>
            <div className="scrollbar-thin max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {viewTest.questions.map((q, i) => (
                <div key={q.id} className="rounded-lg border border-stone-200 p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 text-sm font-medium text-slate-800">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-700 text-xs font-bold text-white" aria-hidden="true">{i + 1}</span>
                      {q.question_text}
                    </div>
                    <Badge color={q.difficulty === "easy" ? "success" : q.difficulty === "hard" ? "danger" : "warning"}>
                      {q.difficulty === "easy" ? "oson" : q.difficulty === "hard" ? "qiyin" : "o'rta"}
                    </Badge>
                  </div>
                  <div className="grid gap-1.5 pl-8 text-sm text-slate-600 sm:grid-cols-2">
                    {q.options.map((o) => (
                      <div key={o.letter} className={`flex items-center gap-2 rounded-md px-2 py-1 ${o.letter === q.correct_answer ? "bg-success-50 font-medium text-success-700" : ""}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${o.letter === q.correct_answer ? "bg-success-600 text-white" : "bg-stone-100 text-slate-500"}`} aria-hidden="true">
                          {o.letter}
                        </span>
                        {o.text}
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
