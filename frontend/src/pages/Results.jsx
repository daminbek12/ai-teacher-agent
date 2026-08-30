import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Badge, Empty, PageSkeleton, Select, Field } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

const letters = ["A", "B", "C", "D", "E"];

function ScoreRing({ percent, size = 120 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  const color = percent >= 70 ? "#059669" : percent >= 50 ? "#D97706" : "#E11D48";
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Natija: ${percent} foiz`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E7E5E4" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="10" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold text-slate-900">{percent}%</span>
      </div>
    </div>
  );
}

function TopicBar({ topic, value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = pct >= 70 ? "bg-success-600" : pct >= 40 ? "bg-warning-600" : "bg-danger-600";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-slate-600">{topic}</span>
        <span className="shrink-0 font-semibold text-slate-800">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="presentation">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  );
}

export default function Results() {
  const toast = useToast();
  const [tests, setTests] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selTest, setSelTest] = useState("");
  const [selStudent, setSelStudent] = useState("");
  const [testView, setTestView] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [graded, setGraded] = useState(null);
  const [weakness, setWeakness] = useState(null);
  const [grading, setGrading] = useState(false);

  const load = async () => {
    try {
      const [t, c, s, r] = await Promise.all([
        api("/tests"),
        api("/classes"),
        api("/students"),
        api("/tests/results"),
      ]);
      setTests(t.filter((x) => x.status === "ready"));
      setClasses(c);
      setStudents(s);
      setResults(r);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const questions = testView?.questions || [];
  const answeredCount = Object.keys(answers).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  const pick = (qid, letter) => setAnswers((p) => ({ ...p, [qid]: letter }));

  const grade = async () => {
    if (!selStudent) return toast.warning("Avval o'quvchini tanlang");
    if (answeredCount === 0) return toast.warning("Kamida bitta savolga javob bering");
    setGrading(true);
    try {
      const res = await api(`/tests/${testView.id}/grade`, {
        method: "POST",
        body: { student_id: Number(selStudent), answers },
      });
      setGraded(res);
      toast.success(`Baholash yakunlandi: ${res.percent}% (baho ${res.grade})`);
      try {
        const w = await api(`/tests/results/weak/${selStudent}`);
        setWeakness(w);
      } catch {}
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGrading(false);
    }
  };

  const pickTest = async (id) => {
    setSelTest(id);
    setTestView(null);
    setAnswers({});
    setCurrentQ(0);
    setGraded(null);
    setWeakness(null);
    if (!id) return;
    try {
      const t = await api(`/tests/${id}`);
      setTestView(t);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const classStats = useMemo(() => {
    const byClassId = {};
    classes.forEach((c) => (byClassId[c.id] = { name: c.name, total: 0, sum: 0 }));
    results.forEach((r) => {
      if (byClassId[r.class_id]) {
        byClassId[r.class_id].total += 1;
        byClassId[r.class_id].sum += r.percent || 0;
      }
    });
    return Object.values(byClassId)
      .filter((c) => c.total > 0)
      .map((c) => ({ name: c.name, avg: Math.round(c.sum / c.total), count: c.total }));
  }, [results, classes]);

  const weakTopics = (weakness?.weakTopics || []).slice().sort((a, b) => b.mistakes - a.mistakes);
  const strongMax = Math.max(...(graded?.wrong || []).length + answeredCount > 0 ? [answeredCount - (graded?.wrong?.length || 0), ...weakTopics.map((w) => w.mistakes)] : [1]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Natijalar va baholash</h1>
        <p className="mt-1 text-body-sm">Test baholash, xatolar tahlili, individual tavsiyalar</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Testni baholash" subtitle="O'quvchi javoblarini kiriting" className="lg:col-span-1">
          <Field label="Test" htmlFor="res-test">
            <Select id="res-test" value={selTest} onChange={(e) => pickTest(e.target.value)}>
              <option value="">Test tanlang</option>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          </Field>
          <Field label="O'quvchi" htmlFor="res-student">
            <Select id="res-student" value={selStudent} onChange={(e) => setSelStudent(e.target.value)}>
              <option value="">O'quvchi tanlang</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </Select>
          </Field>

          {testView && questions.length > 0 && (
            <>
              <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Javob berilgan: <b className="text-slate-900">{answeredCount}</b> / {questions.length}</span>
                  <span className="font-semibold text-primary-700">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin="0" aria-valuemax="100" aria-label="Test jarayoni">
                  <div className="h-full rounded-full bg-primary-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                {questions.length > 3 && (
                  <div className="mt-3 flex flex-wrap gap-1.5" role="navigation" aria-label="Savollar navigatsiyasi">
                    {questions.map((q, i) => {
                      const answered = answers[q.id] != null;
                      const active = i === currentQ;
                      return (
                        <button
                          key={q.id}
                          onClick={() => setCurrentQ(i)}
                          aria-label={`Savol ${i + 1}${answered ? " (javob berilgan)" : ""}`}
                          aria-current={active ? "step" : undefined}
                          className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold transition-all duration-150 ${
                            active
                              ? "bg-primary-700 text-white shadow-sm"
                              : answered
                                ? "bg-primary-100 text-primary-800 hover:bg-primary-200"
                                : "bg-stone-200 text-slate-500 hover:bg-stone-300"
                          }`}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {questions.length <= 3 ? (
                  questions.map((q, i) => (
                    <QuestionCard key={q.id} q={q} idx={i} answers={answers} onPick={pick} compact />
                  ))
                ) : (
                  <QuestionCard key={questions[currentQ].id} q={questions[currentQ]} idx={currentQ} answers={answers} onPick={pick} />
                )}
              </div>

              {questions.length > 3 && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentQ((p) => Math.max(0, p - 1))} disabled={currentQ === 0}>← Oldingi</Button>
                  <span className="text-caption">Savol {currentQ + 1} / {questions.length}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentQ((p) => Math.min(questions.length - 1, p + 1))} disabled={currentQ === questions.length - 1}>Keyingi →</Button>
                </div>
              )}

              <Button className="mt-4 w-full" onClick={grade} loading={grading} icon="M5 13l4 4L19 7">
                Baholash
              </Button>
            </>
          )}

          {!testView && (
            <Empty icon="search" text="Baholash uchun tayyor test tanlang." />
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {graded && (
            <Card title="Baholash natijasi" subtitle="O'quvchi ko'rsatkichlari">
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <ScoreRing percent={graded.percent} />
                <div className="grid flex-1 grid-cols-2 gap-3 self-stretch sm:grid-cols-3">
                  <MetricTile label="To'g'ri javob" value={`${graded.score}/${graded.total}`} color="success" />
                  <MetricTile label="Noto'g'ri" value={String(graded.wrong?.length || 0)} color="danger" />
                  <MetricTile label="Baho" value={String(graded.grade)} color="accent" sub="Uzbek baholash" />
                </div>
              </div>

              {graded.wrong?.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-h3 mb-3">Xatolar tahlili</h4>
                  <div className="space-y-2">
                    {graded.wrong.map((w, i) => (
                      <div key={i} className="stagger-item rounded-lg border border-danger-100 bg-danger-50/50 px-4 py-3 text-sm" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="font-medium text-slate-800">{w.question}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-slate-500">Sizning javob:</span>
                          <Badge color="danger">{w.given}</Badge>
                          <span className="text-slate-500">To'g'ri javob:</span>
                          <Badge color="success">{w.correct}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {weakness && (
            <Card title="O'quvchi tahlili va tavsiyalar" subtitle="Individual yondashuv">
              <div className="mb-4 flex items-center justify-between rounded-lg bg-primary-50 px-4 py-3">
                <span className="text-sm font-medium text-primary-800">O'rtacha natija</span>
                <span className="font-display text-lg font-bold text-primary-800">{weakness.average ?? "-"}%</span>
              </div>
              {weakTopics.length === 0 ? (
                <Empty icon="default" text="Zaif mavzular aniqlanmadi — ajoyib natija!" />
              ) : (
                <div className="space-y-3">
                  <h4 className="text-caption font-semibold uppercase tracking-wide text-slate-400">Zaif mavzular (xatolar soni)</h4>
                  {weakTopics.map((wt) => (
                    <TopicBar key={wt.topic} topic={wt.topic} value={wt.mistakes} max={strongMax} />
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.495.495A2 2 0 0013 16.9V19a2 2 0 01-2 2h-1" />
                </svg>
                Tavsiya: zaif mavzular bo'yicha keyingi testlar moslashtiriladi.
              </div>
            </Card>
          )}

          {classStats.length > 0 && (
            <Card title="Sinf ko'rsatkichlari" subtitle="Testlar bo'yicha o'rtacha foiz">
              <div className="space-y-4">
                {classStats.map((c) => (
                  <TopicBar key={c.name} topic={`${c.name} (${c.count} natija)`} value={c.avg} max={100} />
                ))}
              </div>
            </Card>
          )}

          <Card title="So'nggi natijalar" subtitle="Barcha testlar bo'yicha">
            {results.length === 0 ? (
              <Empty icon="data" text="Hali natijalar yo'q. Testni baholanganidan keyin bu yerda ko'rinadi." />
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2.5 pr-3">O'quvchi</th>
                      <th className="pb-2.5 pr-3">Test</th>
                      <th className="pb-2.5 pr-3">Natija</th>
                      <th className="pb-2.5 pr-3">Baho</th>
                      <th className="pb-2.5">Sana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {results.slice(0, 10).map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-stone-50/60">
                        <td className="py-2.5 pr-3 font-medium text-slate-800">{r.first_name} {r.last_name}</td>
                        <td className="max-w-[220px] truncate py-2.5 pr-3 text-slate-500">{r.title}</td>
                        <td className="py-2.5 pr-3">
                          <Badge color={r.percent >= 70 ? "success" : r.percent >= 50 ? "warning" : "danger"}>{r.percent}%</Badge>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`font-semibold ${r.grade >= 4 ? "text-success-700" : r.grade >= 3 ? "text-warning-700" : "text-danger-700"}`}>{r.grade}</span>
                        </td>
                        <td className="py-2.5 text-slate-400"><time>{r.created_at?.slice(0, 10)}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, color, sub }) {
  const colors = {
    success: "bg-success-50 text-success-700",
    danger: "bg-danger-50 text-danger-700",
    accent: "bg-accent-50 text-accent-700",
  };
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-4 text-center ${colors[color] || colors.success}`}>
      <span className="font-display text-2xl font-bold">{value}</span>
      <span className="mt-1 text-xs font-medium opacity-80">{label}</span>
      {sub && <span className="mt-0.5 text-xs opacity-60">{sub}</span>}
    </div>
  );
}

function QuestionCard({ q, idx, answers, onPick, compact = false }) {
  const given = answers[q.id];
  return (
    <fieldset className={`rounded-xl border transition-colors duration-200 ${given != null ? "border-primary-300 bg-primary-50/30" : "border-stone-200 bg-white"} ${compact ? "p-3.5" : "p-4 sm:p-5"}`}>
      <legend className="sr-only">Savol {idx + 1}</legend>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-xs font-bold text-white" aria-hidden="true">
            {idx + 1}
          </span>
          <p className={`font-medium text-slate-800 ${compact ? "text-sm" : "text-base"}`}>{q.question_text}</p>
        </div>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`} role="radiogroup" aria-label={`${idx + 1}-savol variantlari`}>
        {(q.options || []).map((o, oi) => {
          const selected = given === o.letter;
          return (
            <label
              key={o.letter}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150 ${
                selected
                  ? "border-primary-600 bg-primary-50 text-primary-900 shadow-sm ring-1 ring-primary-600"
                  : "border-stone-200 bg-white text-slate-700 hover:border-primary-300 hover:bg-primary-50/40"
              }`}
            >
              <input
                type="radio"
                name={`q-${q.id}`}
                value={o.letter}
                checked={selected}
                onChange={() => onPick(q.id, o.letter)}
                className="sr-only"
              />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold transition-colors duration-150 ${
                  selected ? "bg-primary-700 text-white" : "bg-stone-100 text-slate-600"
                }`}
                aria-hidden="true"
              >
                {selected ? (
                  <svg className="h-4 w-4 animate-check-pop" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  letters[oi] || o.letter
                )}
              </span>
              <span className="flex-1 leading-snug">{o.text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
