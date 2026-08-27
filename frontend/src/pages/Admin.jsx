import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Badge, Spinner, Empty } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Admin() {
  const { user } = useAuth();
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
    await api(`/admin/teachers/${id}/role`, { method: "POST", body: { role } });
    setTeachers((p) => p.map((t) => (t.id === id ? { ...t, role } : t)));
  };

  if (loading) return <Spinner />;

  if (user?.role !== "admin") {
    return (
      <Card>
        <Empty text="Bu sahifa faqat administratorlar uchun" />
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin panel</h1>
        <p className="text-sm text-gray-500">Tizim boshqaruvi va statistika</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[
          { label: "O'qituvchilar", value: stats?.teachers, color: "indigo" },
          { label: "Sinflar", value: stats?.classes, color: "blue" },
          { label: "O'quvchilar", value: stats?.students, color: "green" },
          { label: "Testlar", value: stats?.tests, color: "amber" },
          { label: "Natijalar", value: stats?.results, color: "red" },
          { label: "AI xarajati", value: `$${Number(stats?.aiCost || 0).toFixed(2)}`, color: "indigo" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium text-gray-400">{s.label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{s.value ?? "-"}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="O'qituvchilar" subtitle="Foydalanuvchilarni boshqarish">
          <div className="divide-y divide-gray-50">
            {teachers.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium text-gray-800">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.school_name} · {t.subject}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={t.role === "admin" ? "red" : "gray"}>{t.role === "admin" ? "Admin" : "O'qituvchi"}</Badge>
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
        </Card>

        <Card title="So'nggi faoliyat" subtitle="Tizimdagi eng so'nggi amallar">
          {activity.length === 0 ? (
            <Empty text="Faoliyat yo'q" />
          ) : (
            <div className="space-y-2">
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <Badge color={a.type === "test" ? "indigo" : "green"}>{a.type === "test" ? "Test" : "Natija"}</Badge>
                  <span className="flex-1 text-gray-700">{a.label}</span>
                  <span className="text-xs text-gray-400">{a.date}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
