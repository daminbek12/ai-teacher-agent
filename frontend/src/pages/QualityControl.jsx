import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Button, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

export default function QualityControl() {
  const toast = useToast();
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
      toast.success(`"${test.title}" uchun sifat tekshiruvi yakunlandi`);
    } catch (e) {
      toast.error(e.message);
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
      toast.success(`Qayta yaratilgan savollar: ${r.regenerated}. Yangi QC: ${r.qc?.score}`);
      setReviews(await api(`/tests/${sel.id}/qc`));
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Sifat nazorati (QC)</h1>
        <p className="mt-1 text-body-sm">Har bir savol mustaqil tekshiriladi. Minimal ball: 85</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Testlar" subtitle="Sifat tekshiruvni ishga tushiring">
          {tests.length === 0 ? (
            <Empty
              icon="data"
              text="Tekshirish uchun testlar yo'q. Avval test yarating."
              action={<Button size="sm" variant="secondary" onClick={() => (window.location.href = "/tests")}>Testlar sahifasiga o'tish</Button>}
            />
          ) : (
            <div className="space-y-2">
              {tests.map((t, i) => (
                <div key={t.id} className="stagger-item flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-100 bg-stone-50/50 px-3.5 py-2.5 transition-colors hover:border-primary-200" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{t.title}</div>
                    <div className="text-caption">{t.question_count} savol · Holat: {t.status === "ready" ? "tayyor" : t.status}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => viewReviews(t)}>Natijalar</Button>
                    <Button size="sm" onClick={() => runQc(t)} loading={busy && sel?.id === t.id}>QC</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={sel ? `Tekshiruv: ${sel.title}` : "Natija"} subtitle="Savollar bo'yicha baholar">
          {!sel ? (
            <Empty icon="search" text="Chapdan test tanlab sifat tekshiruvini ishga tushiring." />
          ) : reviews.length === 0 ? (
            <Empty icon="data" text="Hozircha QC natijalari yo'q. 'QC' tugmasini bosing." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-50 px-3.5 py-2.5">
                <span className="text-sm text-primary-800">O'rtacha ball: <b>{Math.round(reviews.reduce((s, r) => s + r.score, 0) / reviews.length)}</b>/100</span>
                <Button size="sm" variant="outline" onClick={regenerate} loading={busy}>Zaiflarini qayta yaratish</Button>
              </div>
              {reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-stone-100 px-3.5 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Badge color={r.passed ? "success" : "danger"}>{r.score} ball {r.passed ? "o'tdi" : "o'tmadi"}</Badge>
                    <button
                      onClick={() =>
                        api(`/tests/${sel.id}/regenerate-weak`, { method: "POST", body: {} })
                          .then(() => viewReviews(sel))
                          .catch((e) => toast.error(e.message))
                      }
                      aria-label="Savolni qayta yaratish"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-primary-50 hover:text-primary-700"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                  {r.issues?.length > 0 && (
                    <ul className="ml-4 list-disc text-xs text-danger-600">
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
