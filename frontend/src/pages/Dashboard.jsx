import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, StatCard, Spinner, Empty, Badge } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const dayNames = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/classes"),
      api("/students"),
      api("/tests"),
      api("/schedule"),
      api("/topics"),
      api("/reminders"),
    ])
      .then(([classes, students, tests, schedule, topics, reminders]) => {
        setData({ classes, students, tests, schedule, topics, reminders });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const testsReady = (data.tests || []).filter((t) => t.status === "ready").length;
  const avgPercent = (data.tests || []).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assalomu alaykum, {user?.name}!</h1>
        <p className="text-sm text-gray-500">Bugungi pedagogik ishlaringiz uchun reja tayyor.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sinflar" value={(data.classes || []).length} color="indigo" sub="Jami sinflaringiz" />
        <StatCard label="O'quvchilar" value={(data.students || []).length} color="blue" sub="Jami o'quvchilar" />
        <StatCard label="Testlar" value={(data.tests || []).length} color="green" sub={`${testsReady} ta tayyor`} />
        <StatCard label="Mavzular" value={(data.topics || []).length} color="amber" sub="O'quv dasturi" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Bugungi darslar" subtitle="Haftalik jadval bo'yicha">
          {data.schedule.length === 0 ? (
            <Empty text="Jadval hali kiritilmagan. Jadval sahifasiga o'ting." />
          ) : (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((d) => {
                const lessons = data.schedule.filter((s) => Number(s.day_of_week) === d);
                if (lessons.length === 0) return null;
                return (
                  <div key={d}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{dayNames[d]}</div>
                    {lessons.map((l) => (
                      <div key={l.id} className="mb-1 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <span className="font-medium text-gray-700">{l.start_time} — {l.subject || "Dars"}</span>
                        <Badge color="indigo">{l.class_name}</Badge>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Eslatmalar" subtitle="Tizim avtomatik xabarlari" action={<Link to="/reports" className="text-xs text-indigo-600">Hisobotlar</Link>}>
            {data.reminders.length === 0 ? (
              <Empty text="Hozircha eslatmalar yo'q" />
            ) : (
              <div className="space-y-2">
                {data.reminders.slice(0, 5).map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <div className="mb-1 text-[11px] text-gray-400">{r.created_at}</div>
                    <pre className="whitespace-pre-wrap font-sans text-sm">{r.message}</pre>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Tezkor amallar">
            <div className="grid grid-cols-2 gap-3">
              <Link to="/tests" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-center text-sm font-medium text-indigo-700 hover:bg-indigo-100">
                Test yaratish
              </Link>
              <Link to="/reports" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                Hisobot olish
              </Link>
              <Link to="/topics" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700 hover:bg-amber-100">
                Mavzu qo'shish
              </Link>
              <Link to="/settings" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-700 hover:bg-blue-100">
                Sozlamalar
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
