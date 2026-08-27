import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Field, Input, Select, Spinner } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({});
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api("/settings"), api("/ai-usage?period=month")])
      .then(([s, u]) => { setSettings(s); setUsage(u); })
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (v) => setSettings((p) => ({ ...p, [k]: v }));

  const save = async () => {
    await api("/settings", { method: "PUT", body: settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sozlamalar</h1>
          <p className="text-sm text-gray-500">Test, jadval va avtomatlashtirish sozlamalari</p>
        </div>
        <Button onClick={save}>{saved ? "Saqlangan ✓" : "Saqlash"}</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Profil" subtitle={user?.school_name}>
            <div className="space-y-3 text-sm text-gray-600">
              <div>Ism: <b>{user?.name}</b></div>
              <div>Fan: <b>{user?.subject || "-"}</b></div>
              <div>Rol: <b>{user?.role === "admin" ? "Administrator" : "O'qituvchi"}</b></div>
            </div>
          </Card>

          <Card title="Test sozlamalari" subtitle="Standart qiymatlar (agar boshqacha berilmasa)">
            <Field label="Haftada necha marta test">
              <Select value={settings.test_frequency || 1} onChange={(e) => set("test_frequency")(Number(e.target.value))}>
                <option value={1}>1 marta</option>
                <option value={2}>2 marta</option>
                <option value={3}>3 marta</option>
              </Select>
            </Field>
            <Field label="Test savollar soni">
              <Select value={settings.test_count || 20} onChange={(e) => set("test_count")(Number(e.target.value))}>
                {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{n} ta</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Test kuni">
                <Select value={settings.test_day != null ? settings.test_day : 5} onChange={(e) => set("test_day")(Number(e.target.value))}>
                  {[["Dushanba", 1], ["Seshanba", 2], ["Chorshanba", 3], ["Payshanba", 4], ["Juma", 5], ["Shanba", 6]].map(([n, v]) => (
                    <option key={v} value={v}>{n}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Test vaqti">
                <Input type="time" value={settings.test_time || "18:00"} onChange={(e) => set("test_time")(e.target.value)} />
              </Field>
            </div>
            <Field label="Qiyinlik nisbati (%)">
              <div className="grid grid-cols-3 gap-3">
                <div><span className="mb-1 block text-xs text-emerald-600">Oson</span><Input type="number" value={settings.difficulty_easy ?? 30} onChange={(e) => set("difficulty_easy")(Number(e.target.value))} /></div>
                <div><span className="mb-1 block text-xs text-amber-600">O'rta</span><Input type="number" value={settings.difficulty_medium ?? 50} onChange={(e) => set("difficulty_medium")(Number(e.target.value))} /></div>
                <div><span className="mb-1 block text-xs text-rose-600">Qiyin</span><Input type="number" value={settings.difficulty_hard ?? 20} onChange={(e) => set("difficulty_hard")(Number(e.target.value))} /></div>
              </div>
            </Field>
            <Field label="Format">
              <Select value={settings.format || "both"} onChange={(e) => set("format")(e.target.value)}>
                <option value="both">Word + PDF</option>
                <option value="word">Faqat Word</option>
                <option value="pdf">Faqat PDF</option>
              </Select>
            </Field>
          </Card>

          <Card title="Kunlik test" subtitle="Har kuni barcha sinflar uchun avtomatik qisqa test">
            <label className="mb-3 flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
              <span className="text-sm text-gray-700">Kunlik test yoqilgan</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-indigo-600"
                checked={settings.daily_test_enabled !== false}
                onChange={(e) => set("daily_test_enabled")(e.target.checked)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Yaratilish vaqti">
                <Input type="time" value={settings.daily_test_time || "08:00"} onChange={(e) => set("daily_test_time")(e.target.value)} />
              </Field>
              <Field label="Savollar soni">
                <Select value={settings.daily_test_count || 10} onChange={(e) => set("daily_test_count")(Number(e.target.value))}>
                  {[5, 10, 15].map((n) => <option key={n} value={n}>{n} ta</option>)}
                </Select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-gray-500">Har kuni belgilangan vaqtda har bir sinf uchun darslik asosida qisqa test avtomatik yaratiladi. Bir kunda bir sinfga bitta kunlik test.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Avtomatlashtirish" subtitle="Agentning mustaqil ishlashi">
            <label className="mb-3 flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
              <span className="text-sm text-gray-700">Avtomatik ish rejimi</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-indigo-600"
                checked={!!settings.scheduler_enabled}
                onChange={(e) => set("scheduler_enabled")(e.target.checked)}
              />
            </label>
            <div className="space-y-2 text-sm text-gray-600">
              <p>- Har kuni 07:30 da ertalabki briefing tayyorlanadi.</p>
              <p>- Har kuni belgilangan vaqtda kunlik test avtomatik yaratiladi.</p>
              <p>- Juma kuni haftalik test avtomatik yaratiladi.</p>
              <p>- Eslatmalar avtomatik yuboriladi.</p>
            </div>
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Muhim: baholash va pedagogik qarorlar doim o'qituvchi nazoratida qoladi.
            </div>
          </Card>

          <Card title="AI xarajatlari" subtitle="Bu oy uchun">
            {usage ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-indigo-50 p-3 text-center">
                  <div className="text-xl font-bold text-indigo-700">{usage.requests}</div>
                  <div className="text-xs text-indigo-500">So'rovlar</div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <div className="text-xl font-bold text-emerald-700">{usage.totalTokens.toLocaleString()}</div>
                  <div className="text-xs text-emerald-500">Tokenlar</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-center">
                  <div className="text-xl font-bold text-amber-700">${usage.totalCost.toFixed(4)}</div>
                  <div className="text-xs text-amber-500">Narxi</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Ma'lumot yo'q</p>
            )}
          </Card>

          <Card title="Telegram" subtitle="Integratsiya">
            <p className="mb-2 text-sm text-gray-600">
              Telegram bot orqali test va hisobotlarni qabul qilish uchun serverda <code className="rounded bg-gray-100 px-1">TELEGRAM_BOT_TOKEN</code> o'rnatilgan bo'lishi kerak.
            </p>
            <p className="text-sm text-gray-600">
              Ulanish uchun: <code className="rounded bg-gray-100 px-1">/start</code> buyrug'ini botga yuboring, so'ng Telegram ID'ingizni shu yerga kiriting.
            </p>
            <Input
              className="mt-3"
              placeholder="tg:123456789 (Telegram chat ID)"
              value={user?.phone || ""}
              onChange={async (e) => { await api("/settings", { method: "PUT", body: { tg_chat: e.target.value } }); }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
