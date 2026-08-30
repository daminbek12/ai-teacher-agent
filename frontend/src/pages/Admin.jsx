import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api("/admin/stats"), api("/auth/all"), api("/admin/activity")])
      .then(([s, t, a]) => { setStats(s); setTeachers(t); setActivity(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setRole = async (id, role) => {
    try {
      await api(`/admin/teachers/${id}/role`, { method: "POST", body: { role } });
      setTeachers((p) => p.map((t) => (t.id === id ? { ...t, role } : t)));
      toast.success("Rol o'zgartirildi");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <PageSkeleton />;

  if (user?.role !== "admin") {
    return (
      <Card>
        <Empty
          icon="default"
          text="Bu sahifa faqat administratorlar uchun. Agar admin bo'lishingiz kerak bo'lsa, tizim administratoriga murojaat qiling."
        />
      </Card>
    );
  }

  const statItems = [
    { label: "O'qituvchilar", value: stats?.teachers, color: "bg-primary-50 text-primary-700" },
    { label: "Sinflar", value: stats?.classes, color: "bg-accent-50 text-accent-700" },
    { label: "O'quvchilar", value: stats?.students, color: "bg-success-50 text-success-700" },
    { label: "Testlar", value: stats?.tests, color: "bg-primary-50 text-primary-700" },
    { label: "Natijalar", value: stats?.results, color: "bg-warning-50 text-warning-700" },
    { label: "AI xarajati", value: `$${Number(stats?.aiCost || 0).toFixed(2)}`, color: "bg-danger-50 text-danger-700" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Admin panel</h1>
        <p className="mt-1 text-body-sm">Tizim boshqaruvi va statistika</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {statItems.map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
            <div className={`mb-2 inline-block rounded-lg px-2 py-1 text-xs font-semibold ${s.color}`}>{s.label}</div>
            <div className="font-display text-2xl font-bold text-slate-900">{s.value ?? "-"}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="O'qituvchilar" subtitle="Foydalanuvchilarni boshqarish">
          {teachers.length === 0 ? (
            <Empty icon="students" text="O'qituvchilar ro'yxati bo'sh" />
          ) : (
            <div className="divide-y divide-stone-100">
              {teachers.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700" aria-hidden="true">
                      {t.name?.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{t.name}</div>
                      <div className="text-caption">{t.school_name} · {t.subject}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={t.role === "admin" ? "danger" : "neutral"}>{t.role === "admin" ? "Admin" : "O'qituvchi"}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRole(t.id, t.role === "admin" ? "teacher" : "admin")}
                    >
                      {t.role === "admin" ? "O'qituvchi qilish" : "Admin qilish"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="So'nggi faoliyat" subtitle="Tizimdagi eng so'nggi amallar">
          {activity.length === 0 ? (
            <Empty icon="data" text="Faoliyat yo'q" />
          ) : (
            <div className="space-y-2">
              {activity.map((a, i) => (
                <div key={i} className="stagger-item flex items-center gap-3 rounded-lg bg-stone-50 px-3.5 py-2.5 text-sm" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <Badge color={a.type === "test" ? "primary" : "success"}>{a.type === "test" ? "Test" : "Natija"}</Badge>
                  <span className="flex-1 truncate text-slate-700">{a.label}</span>
                  <span className="shrink-0 text-caption"><time>{a.date}</time></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
