import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Field, Select, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function Reports() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selClass, setSelClass] = useState("");
  const [selStudent, setSelStudent] = useState("");
  const [weekly, setWeekly] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [development, setDevelopment] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [c, s] = await Promise.all([api("/classes"), api("/students")]);
    setClasses(c);
    setStudents(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadReports = async (classId) => {
    setSelClass(classId);
    if (!classId) { setWeekly(null); setMonthly(null); return; }
    const [w, m] = await Promise.all([
      api(`/reports/weekly?class_id=${classId}`),
      api(`/reports/monthly?class_id=${classId}`),
    ]);
    setWeekly(w);
    setMonthly(m);
  };

  const loadDevelopment = async (studentId) => {
    setSelStudent(studentId);
    if (!studentId) { setDevelopment(null); return; }
    const d = await api(`/reports/development/${studentId}`);
    setDevelopment(d);
  };

  const download = async (type, format) => {
    const blob = await api(`/reports/weekly/${format}?class_id=${selClass}`, { download: true });
    downloadBlob(blob, `haftalik-hisobot.${format}`);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hisobotlar</h1>
        <p className="text-sm text-gray-500">Haftalik va oylik hisobotlar, o'quvchi rivojlanishi</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Haftalik hisobot" subtitle="Sinflar bo'yicha">
            <Field label="Sinf">
              <Select value={selClass} onChange={(e) => loadReports(e.target.value)}>
                <option value="">Sinf tanlang</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            {weekly && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-indigo-50 p-3 text-center">
                    <div className="text-xl font-bold text-indigo-700">{weekly.testsTaken}</div>
                    <div className="text-xs text-indigo-500">Testlar</div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-center">
                    <div className="text-xl font-bold text-emerald-700">{weekly.average ?? "-"}%</div>
                    <div className="text-xs text-emerald-500">O'rtacha</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 text-center">
                    <div className="text-xl font-bold text-amber-700">{weekly.worstTopic ? weekly.worstTopic.mistakes : 0}</div>
                    <div className="text-xs text-amber-500">Eng ko'p xato</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => download("weekly", "pdf")}>PDF</Button>
                  <Button variant="outline" size="sm" onClick={() => download("weekly", "docx")}>Word</Button>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-700">Eng yaxshi o'quvchilar</h4>
                  {(weekly.best || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm text-gray-600">
                      <span>{s.name}</span><Badge color="green">{s.avg}%</Badge>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-700">Yordam kerak</h4>
                  {(weekly.needsHelp || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm text-gray-600">
                      <span>{s.name}</span><Badge color="red">{s.avg}%</Badge>
                    </div>
                  ))}
                </div>
                {weekly.worstTopic && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    Eng ko'p xato mavzu: <b>{weekly.worstTopic.topic}</b>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Oylik hisobot" subtitle="30 kunlik statistikasi">
            {monthly ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <div className="text-xl font-bold text-blue-700">{monthly.testsTaken}</div>
                    <div className="text-xs text-blue-500">Testlar</div>
                  </div>
                  <div className="rounded-lg bg-indigo-50 p-3 text-center">
                    <div className="text-xl font-bold text-indigo-700">{monthly.average ?? "-"}%</div>
                    <div className="text-xs text-indigo-500">O'rtacha</div>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3 text-center">
                    <div className="text-xl font-bold text-green-700">{monthly.improved?.length || 0}</div>
                    <div className="text-xs text-green-500">O'sayotganlar</div>
                  </div>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-700">Eng yaxshi o'quvchilar</h4>
                  {(monthly.topStudents || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm text-gray-600">
                      <span>{s.name}</span><Badge color="green">{s.avg}%</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty text="Sinf tanlang" />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="O'quvchi rivojlanishi" subtitle="Faqat ball emas, o'sish dinamikasi">
            <Field label="O'quvchi">
              <Select value={selStudent} onChange={(e) => loadDevelopment(e.target.value)}>
                <option value="">O'quvchi tanlang</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </Select>
            </Field>
            {development && (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-3">
                  <Badge color={development.trend >= 0 ? "green" : "red"}>
                    O'sish: {development.trend >= 0 ? "+" : ""}{development.trend}%
                  </Badge>
                  <Badge color="indigo">O'rtacha: {development.average ?? "-"}%</Badge>
                </div>
                <div className="flex items-end gap-2 border-b border-gray-100 pb-2" style={{ height: 140 }}>
                  {development.progression.map((p, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-xs font-semibold text-indigo-600">{p.percent}%</span>
                      <div
                        className="w-full rounded-t bg-indigo-500"
                        style={{ height: `${Math.max(p.percent * 1.1, 6)}px`, opacity: 0.5 + (i / development.progression.length) * 0.5 }}
                        title={`${p.date}: ${p.percent}% (baho ${p.grade})`}
                      />
                      <span className="mt-1 text-[10px] text-gray-400">{i + 1}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-400">Testlar bo'yicha foiz ko'rsatkichi (chapdan o'ngga)</div>
              </div>
            )}
          </Card>

          <Card title="Avtomatik hisobotlar" subtitle="Jadval bo'yicha tayyorlanadi">
            <div className="space-y-2 text-sm text-gray-600">
              <p>- Har <b>juma</b> kuni avtomatik haftalik hisobot tayyorlanadi.</p>
              <p>- Har <b>oy oxirida</b> oylik hisobot, reyting va statistikalar.</p>
              <p>- Har kuni <b>ertalab</b> darslar uchun briefing yuboriladi.</p>
              <p>- Hisobotlar Word/PDF/Excel formatida eksport qilinadi.</p>
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => api("/briefing", { method: "POST" }).then((r) => alert(r.message || "Briefing tayyor"))}>
              Briefingni hozir tekshirish
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
