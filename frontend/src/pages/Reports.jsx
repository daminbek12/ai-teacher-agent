import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Field, Select, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Reports() {
  const toast = useToast();
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
    try {
      const blob = await api(`/reports/weekly/${format}?class_id=${selClass}`, { download: true });
      downloadBlob(blob, `haftalik-hisobot.${format}`);
    } catch {
      toast.error("Hisobotni yuklab olishda xatolik");
    }
  };

  const checkBriefing = async () => {
    try {
      const r = await api("/briefing", { method: "POST" });
      toast.success(r.message || "Briefing tayyor");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Hisobotlar</h1>
        <p className="mt-1 text-body-sm">Haftalik va oylik hisobotlar, o'quvchi rivojlanishi</p>
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
                  <div className="rounded-xl bg-primary-50 p-3 text-center">
                    <div className="font-display text-xl font-bold text-primary-700">{weekly.testsTaken}</div>
                    <div className="text-xs font-medium text-primary-600">Testlar</div>
                  </div>
                  <div className="rounded-xl bg-success-50 p-3 text-center">
                    <div className="font-display text-xl font-bold text-success-700">{weekly.average ?? "-"}%</div>
                    <div className="text-xs font-medium text-success-600">O'rtacha</div>
                  </div>
                  <div className="rounded-xl bg-warning-50 p-3 text-center">
                    <div className="font-display text-xl font-bold text-warning-700">{weekly.worstTopic ? weekly.worstTopic.mistakes : 0}</div>
                    <div className="text-xs font-medium text-warning-600">Eng ko'p xato</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => download("weekly", "pdf")}>PDF</Button>
                  <Button variant="outline" size="sm" onClick={() => download("weekly", "docx")}>Word</Button>
                </div>
                <div>
                  <h4 className="text-h3 mb-1.5">Eng yaxshi o'quvchilar</h4>
                  {(weekly.best || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm text-slate-600">
                      <span>{s.name}</span><Badge color="success">{s.avg}%</Badge>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="text-h3 mb-1.5">Yordam kerak</h4>
                  {(weekly.needsHelp || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm text-slate-600">
                      <span>{s.name}</span><Badge color="danger">{s.avg}%</Badge>
                    </div>
                  ))}
                </div>
                {weekly.worstTopic && (
                  <div className="rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
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
                  <div className="rounded-xl bg-primary-50 p-3 text-center">
                    <div className="font-display text-xl font-bold text-primary-700">{monthly.testsTaken}</div>
                    <div className="text-xs font-medium text-primary-600">Testlar</div>
                  </div>
                  <div className="rounded-xl bg-accent-50 p-3 text-center">
                    <div className="font-display text-xl font-bold text-accent-700">{monthly.average ?? "-"}%</div>
                    <div className="text-xs font-medium text-accent-600">O'rtacha</div>
                  </div>
                  <div className="rounded-xl bg-success-50 p-3 text-center">
                    <div className="font-display text-xl font-bold text-success-700">{monthly.improved?.length || 0}</div>
                    <div className="text-xs font-medium text-success-600">O'sayotganlar</div>
                  </div>
                </div>
                <div>
                  <h4 className="text-h3 mb-1.5">Eng yaxshi o'quvchilar</h4>
                  {(monthly.topStudents || []).map((s, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm text-slate-600">
                      <span>{s.name}</span><Badge color="success">{s.avg}%</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty icon="search" text="Hisobotlarni ko'rish uchun sinf tanlang." />
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
                <div className="mb-3 flex items-center gap-2">
                  <Badge color={development.trend >= 0 ? "success" : "danger"}>
                    O'sish: {development.trend >= 0 ? "+" : ""}{development.trend}%
                  </Badge>
                  <Badge color="primary">O'rtacha: {development.average ?? "-"}%</Badge>
                </div>
                <div className="flex items-end gap-2 border-b border-stone-200 pb-2" style={{ height: 140 }} role="img" aria-label="O'quvchi natijalari diagrammasi">
                  {development.progression.map((p, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-xs font-semibold text-primary-700">{p.percent}%</span>
                      <div
                        className="w-full rounded-t bg-primary-500 transition-all duration-500"
                        style={{ height: `${Math.max(p.percent * 1.1, 6)}px`, opacity: 0.5 + (i / development.progression.length) * 0.5 }}
                        title={`${p.date}: ${p.percent}% (baho ${p.grade})`}
                      />
                      <span className="mt-1 text-caption">{i + 1}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-caption">Testlar bo'yicha foiz ko'rsatkichi (chapdan o'ngga)</div>
              </div>
            )}
          </Card>

          <Card title="Avtomatik hisobotlar" subtitle="Jadval bo'yicha tayyorlanadi">
            <div className="space-y-2 text-sm text-slate-600">
              <p className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" aria-hidden="true" /> Har <b className="mx-1">juma</b> kuni avtomatik haftalik hisobot tayyorlanadi.</p>
              <p className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" aria-hidden="true" /> Har <b className="mx-1">oy oxirida</b> oylik hisobot, reyting va statistikalar.</p>
              <p className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" aria-hidden="true" /> Har kuni <b className="mx-1">ertalab</b> darslar uchun briefing yuboriladi.</p>
              <p className="flex items-start gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" aria-hidden="true" /> Hisobotlar Word/PDF/Excel formatida eksport qilinadi.</p>
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={checkBriefing}>
              Briefingni hozir tekshirish
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
