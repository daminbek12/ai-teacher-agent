import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, StatCard, Empty, Badge, PageSkeleton, Button } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const dayNames = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

const icons = {
  classes: "M17 20h5v-2a3 3 0 00-3-3M9 20H4v-2a3 3 0 013-3m6-3a3 3 0 100-6 3 3 0 000 6zM9 12a3 3 0 100-6 3 3 0 000 6z",
  students: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zm10 14v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  tests: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  topics: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
};

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
      api("/tests/results"),
    ])
      .then(([classes, students, tests, schedule, topics, reminders, results]) => {
        setData({ classes, students, tests, schedule, topics, reminders, results });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <PageSkeleton />;

  const todayIdx = new Date().getDay();
  const todayDow = todayIdx === 0 ? 7 : todayIdx;
  const todayLessons = (data.schedule || []).filter((s) => Number(s.day_of_week) === todayDow);
  const weekLessons = (data.schedule || []).filter((s) => Number(s.day_of_week) !== todayDow);

  const testsReady = (data.tests || []).filter((t) => t.status === "ready").length;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return (data.tests || []).filter((t) => (t.created_at || "").slice(0, 10) === key).length;
  });

  const half = Math.floor(7 / 2);
  const prev = last7.slice(0, half).reduce((a, b) => a + b, 0);
  const curr = last7.slice(half).reduce((a, b) => a + b, 0);
  const testTrend = prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

  const resultsAvg = (data.results || []).reduce((s, r) => s + (r.percent || 0), 0) / ((data.results || []).length || 1);

  const quickActions = [
    { to: "/tests", label: "Test yaratish", desc: "Yangi test tuzish", color: "primary" },
    { to: "/results", label: "Baholash", desc: "Natijalarni kiritish", color: "accent" },
    { to: "/topics", label: "Mavzu qo'shish", desc: "O'quv dasturini to'ldirish", color: "success" },
    { to: "/reports", label: "Hisobot olish", desc: "Haftalik tahlil", color: "neutral" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Assalomu alaykum, {user?.name}!</h1>
        <p className="mt-1 text-body-sm">Bugungi pedagogik ishlaringiz uchun reja tayyor.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sinflar" value={(data.classes || []).length} sub="Jami sinflaringiz" color="primary" icon={icons.classes} />
        <StatCard label="O'quvchilar" value={(data.students || []).length} sub="Jami o'quvchilar" color="neutral" icon={icons.students} />
        <StatCard
          label="Testlar"
          value={(data.tests || []).length}
          sub={`${testsReady} ta tayyor holatda`}
          color="success"
          icon={icons.tests}
          trend={testTrend}
          spark={last7}
        />
        <StatCard
          label="Mavzular"
          value={(data.topics || []).length}
          sub={`O'rtacha natija: ${Math.round(resultsAvg)}%`}
          color="accent"
          icon={icons.topics}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          title="Bugungi darslar"
          subtitle={dayNames[todayDow]}
          className="xl:col-span-3"
          action={todayLessons.length === 0 ? <Link to="/schedule" className="text-xs font-semibold text-primary-700 hover:text-primary-800">Jadval qo'shish</Link> : null}
        >
          {todayLessons.length === 0 ? (
            <Empty
              icon="data"
              text="Bugun darslar yo'q yoki jadval hali kiritilmagan."
              action={<Button size="sm" variant="secondary" onClick={() => (window.location.href = "/schedule")}>Dars jadvalini to'ldirish</Button>}
            />
          ) : (
            <ol className="space-y-2">
              {todayLessons.map((l, i) => (
                <li
                  key={l.id}
                  className="stagger-item flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-stone-100 bg-stone-50/70 px-4 py-2.5 transition-colors hover:border-primary-200 hover:bg-primary-50/40"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="flex items-center gap-3 truncate">
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-primary-700 shadow-sm" aria-hidden="true">{l.start_time}</span>
                    <span className="truncate text-sm font-medium text-slate-700">{l.subject || "Dars"}</span>
                  </span>
                  <Badge color="primary">{l.class_name}</Badge>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Tezkor amallar" subtitle="Tez-tez ishlatiladigan" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="group flex min-h-[56px] flex-col justify-center rounded-lg border border-stone-200 bg-stone-50/50 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50 hover:shadow-card"
              >
                <span className="text-sm font-semibold text-slate-800 group-hover:text-primary-800">{a.label}</span>
                <span className="mt-0.5 text-xs text-slate-500">{a.desc}</span>
              </Link>
            ))}
          </div>
        </Card>

        {weekLessons.length > 0 && (
          <Card title="Haftalik darslar" subtitle="Qolgan kunlar" className="xl:col-span-3">
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].filter((d) => d !== todayDow).map((d) => {
                const lessons = weekLessons.filter((s) => Number(s.day_of_week) === d);
                if (lessons.length === 0) return null;
                return (
                  <div key={d}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{dayNames[d]}</div>
                    <div className="space-y-1.5">
                      {lessons.map((l) => (
                        <div key={l.id} className="flex min-h-[36px] items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-1.5">
                          <span className="truncate text-xs font-medium text-slate-600">{l.start_time} — {l.subject || "Dars"}</span>
                          <Badge color="neutral">{l.class_name}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card
          title="Eslatmalar"
          subtitle="Tizim avtomatik xabarlari"
          className="xl:col-span-2"
          action={data.reminders.length > 0 ? <Link to="/reports" className="text-xs font-semibold text-primary-700 hover:text-primary-800">Hisobotlar</Link> : null}
        >
          {data.reminders.length === 0 ? (
            <Empty icon="default" text="Hozircha eslatmalar yo'q. Tizim ishga tushganda avtomatik xabarlar paydo bo'ladi." />
          ) : (
            <div className="space-y-2">
              {data.reminders.slice(0, 5).map((r) => (
                <div key={r.id} className="rounded-lg border border-stone-100 bg-stone-50/70 px-3.5 py-2.5 text-sm text-slate-700">
                  <div className="mb-1 flex items-center gap-2 text-caption">
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <time>{(r.created_at || "").slice(0, 16).replace("T", " ")}</time>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{r.message}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
