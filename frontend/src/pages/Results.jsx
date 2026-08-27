import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Modal, Field, Select, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function Results() {
  const [tests, setTests] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selTest, setSelTest] = useState("");
  const [selStudent, setSelStudent] = useState("");
  const [testView, setTestView] = useState(null);
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(null);
  const [weakness, setWeakness] = useState(null);

  const load = async () => {
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
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grade = async () => {
    try {
      const res = await api(`/tests/${testView.id}/grade`, {
        method: "POST",
        body: { student_id: Number(selStudent), answers },
      });
      setGraded(res);
      const w = await api(`/tests/results/weak/${selStudent}`);
      setWeakness(w);
    } catch (err) {
      alert(err.message);
    }
  };

  const pickTest = async (id) => {
    const t = await api(`/tests/${id}`);
    setTestView(t);
    setAnswers({});
    setGraded(null);
    setWeakness(null);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Natijalar va baholash</h1>
        <p className="text-sm text-gray-500">Test baholash, xatolar tahlili, individual tavsiyalar</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Testni baholash" subtitle="O'quvchi javoblarini kiriting">
            <Field label="Test">
              <Select value={selTest} onChange={(e) => { setSelTest(e.target.value); pickTest(e.target.value); }}>
                <option value="">Test tanlang</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
            </Field>
            <Field label="O'quvchi">
              <Select value={selStudent} onChange={(e) => setSelStudent(e.target.value)}>
                <option value="">O'quvchi tanlang</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </Select>
            </Field>
            {testView && (
              <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
                {testView.questions.map((q, i) => (
                  <div key={q.id} className="rounded-lg border border-gray-100 p-2.5">
                    <div className="mb-1 text-xs font-medium text-gray-700">{i + 1}. {q.question_text}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {q.options.map((o) => (
                        <label key={o.letter} className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={o.letter}
                            checked={answers[q.id] === o.letter}
                            onChange={() => setAnswers((p) => ({ ...p, [q.id]: o.letter }))}
                          />
                          {o.letter}) {o.text}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {testView && (
              <Button className="mt-3 w-full" onClick={grade}>Baholash</Button>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {graded && (
            <Card title="Baholash natijasi">
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-indigo-50 p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-700">{graded.score}/{graded.total}</div>
                  <div className="text-xs text-indigo-500">To'g'ri javoblar</div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{graded.percent}%</div>
                  <div className="text-xs text-emerald-500">Foiz</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-4 text-center">
                  <div className="text-2xl font-bold text-amber-700">Baho: {graded.grade}</div>
                  <div className="text-xs text-amber-500">Uzbek baholash</div>
                </div>
              </div>
              {graded.wrong.length > 0 && (
                <div>
                  <h4 className="mb-2 font-semibold text-gray-700">Xatolar tahlili</h4>
                  <div className="space-y-2">
                    {graded.wrong.map((w, i) => (
                      <div key={i} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm">
                        <span className="font-medium">{w.question}</span>
                        <div className="text-xs text-gray-500">
                          Sizning javob: <b className="text-rose-600">{w.given}</b> · To'g'ri: <b className="text-emerald-600">{w.correct}</b>
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
              <div className="mb-3 text-sm text-gray-600">
                O'rtacha natija: <b>{weakness.average ?? "-"}%</b>
              </div>
              {weakness.weakTopics.length === 0 ? (
                <Empty text="Zaif mavzular aniqlanmadi" />
              ) : (
                <div className="space-y-2">
                  {weakness.weakTopics.map((wt) => (
                    <div key={wt.topic} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                      <span className="text-sm text-gray-700">{wt.topic}</span>
                      <Badge color="red">{wt.mistakes} xato</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                Tavsiya: zaif mavzulardan ko'proq savol berish kerak, keyingi test shunga moslashtiriladi.
              </div>
            </Card>
          )}

          <Card title="So'nggi natijalar" subtitle="Barcha testlar bo'yicha">
            {results.length === 0 ? (
              <Empty text="Natijalar yo'q" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                      <th className="pb-2">O'quvchi</th>
                      <th className="pb-2">Test</th>
                      <th className="pb-2">Natija</th>
                      <th className="pb-2">Baho</th>
                      <th className="pb-2">Sana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.slice(0, 10).map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-medium text-gray-800">{r.first_name} {r.last_name}</td>
                        <td className="py-2 text-gray-500">{r.title}</td>
                        <td className="py-2">
                          <Badge color={r.percent >= 70 ? "green" : r.percent >= 50 ? "amber" : "red"}>{r.percent}%</Badge>
                        </td>
                        <td className="py-2">{r.grade}</td>
                        <td className="py-2 text-gray-400">{r.created_at?.slice(0, 10)}</td>
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
