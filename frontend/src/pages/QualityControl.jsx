import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function QualityControl() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setTests(await api("/tests"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runQc = async (test) => {
    setSel(test);
    setBusy(true);
    try {
      await api(`/tests/${test.id}/qc`, { method: "POST", body: { min_score: 85 } });
      setReviews(await api(`/tests/${test.id}/qc`));
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const viewReviews = async (test) => {
    setSel(test);
    setReviews(await api(`/tests/${test.id}/qc`));
  };

  const regenerate = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await api(`/tests/${sel.id}/regenerate-weak`, { method: "POST", body: {} });
      alert(`Qayta yaratilgan savollar: ${r.regenerated}. Yangi QC: ${r.qc?.score}`);
      setReviews(await api(`/tests/${sel.id}/qc`));
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sifat nazorati (QC)</h1>
        <p className="text-sm text-gray-500">Har bir savol mustaqil tekshiriladi. Minimal ball: 85</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Testlar" subtitle="Sifat tekshiruvni ishga tushiring">
          {tests.length === 0 ? (
            <Empty text="Testlar yo'q" />
          ) : (
            <div className="space-y-2">
              {tests.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{t.title}</div>
                    <div className="text-xs text-gray-400">{t.question_count} savol · Holat: {t.status}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => viewReviews(t)}>Natijalar</Button>
                    <Button size="sm" onClick={() => runQc(t)} disabled={busy}>{busy ? "..." : "QC"}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={sel ? `Tekshiruv: ${sel.title}` : "Natija"} subtitle="Savollar bo'yicha baholar">
          {!sel ? (
            <Empty text="Testni tanlang" />
          ) : reviews.length === 0 ? (
            <Empty text="Hozircha QC natijalari yo'q" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">O'rtacha ball: <b>{Math.round(reviews.reduce((s, r) => s + r.score, 0) / reviews.length)}</b>/100</span>
                <Button size="sm" variant="outline" onClick={regenerate} disabled={busy}>Zaiflarini qayta yaratish</Button>
              </div>
              {reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-100 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <Badge color={r.passed ? "green" : "red"}>{r.score} ball {r.passed ? "o'tdi" : "o'tmadi"}</Badge>
                    <Button size="sm" variant="ghost" onClick={() =>
                      api(`/tests/${sel.id}/regenerate-weak`, { method: "POST", body: {} }).then(() => viewReviews(sel))
                    }>↻</Button>
                  </div>
                  {r.issues?.length > 0 && (
                    <ul className="ml-4 list-disc text-xs text-rose-600">
                      {r.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
