import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Modal, Field, Input, Badge, Spinner, Empty } from "../components/ui.jsx";

export default function Textbooks() {
  const [textbooks, setTextbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ subject: "Tarix", grade: "7", title: "", edition_year: "" });
  const [structureText, setStructureText] = useState("");
  const [showStructure, setShowStructure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = async () => {
    const tbs = await api("/textbooks");
    setTextbooks(tbs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const downloadPdf = async (id) => {
    try {
      const blob = await api(`/textbooks/${id}/file`, { download: true });
      const tb = sel || textbooks.find((t) => t.id === id);
      downloadBlob(blob, `${(tb?.title || "darslik").replace(/[^\w\d-]+/g, "_")}.pdf`);
    } catch (err) {
      alert(err.message);
    }
  };

  const view = async (id) => {
    const tb = await api(`/textbooks/${id}`);
    setSel(tb);
    const idx = await api(`/textbooks/${id}/index`);
    setSel((p) => ({ ...p, index: idx }));
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) {
      const tb = await api("/textbooks", { method: "POST", body: { ...meta, version: `v${meta.edition_year || "1"}` } });
      setTextbooks((p) => [tb, ...p]);
      setShowUpload(false);
      setMeta({ subject: "Tarix", grade: "7", title: "", edition_year: "" });
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      const base64 = await fileToBase64(file);
      let result;
      if (base64.length > 3 * 1024 * 1024) {
        const CHUNK = 2 * 1024 * 1024;
        const totalChunks = Math.ceil(base64.length / CHUNK);
        const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        for (let i = 0; i < totalChunks; i++) {
          const chunk = base64.slice(i * CHUNK, (i + 1) * CHUNK);
          result = await api("/textbooks/upload-chunk", {
            method: "POST",
            body: {
              upload_id: uploadId,
              chunk_index: i,
              total_chunks: totalChunks,
              chunk_base64: chunk,
              file_name: file.name,
              subject: meta.subject,
              grade: meta.grade,
              title: meta.title || file.name.replace(/\.[^.]+$/, ""),
              edition_year: meta.edition_year,
            },
          });
          setProgress({ done: (result.received || i + 1), total: totalChunks });
          if (result.done) break;
        }
      } else {
        result = await api("/textbooks/upload", {
          method: "POST",
          body: {
            file_base64: base64,
            file_name: file.name,
            subject: meta.subject,
            grade: meta.grade,
            title: meta.title || file.name.replace(/\.[^.]+$/, ""),
            edition_year: meta.edition_year,
          },
        });
      }
      alert(`Darslik yuklandi: ${result.extracted_chars} belgi, ${result.pages} sahifa. Endi bob/mavzularga ajrating.`);
      await load();
      setShowUpload(false);
      setFile(null);
      setProgress(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const fileToBase64 = (f) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(f);
    });

  const structure = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api(`/textbooks/${sel.id}/structure`, {
        method: "POST",
        body: { text: structureText },
      });
      alert(`Strukturani aniqlandi: ${result.chapters} bob, ${result.lessons} mavzu, ${result.chunks} chunk`);
      setShowStructure(false);
      setStructureText("");
      view(sel.id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const activateVersion = async (versionId) => {
    await api(`/textbooks/${sel.id}/versions/${versionId}/activate`, { method: "POST" });
    view(sel.id);
  };

  const search = async () => {
    if (!searchQuery.trim()) return;
    const results = await api(`/textbooks/search/kb?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(results);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Darsliklar</h1>
          <p className="text-sm text-gray-500">PDF/ZIP/rasm yuklash, bob/mavzular, RAG index</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>+ Darslik qo'shish</Button>
      </div>

      <Card title="RAG qidiruv" subtitle="Darsliklar bo'yicha semantic qidiruv" className="mb-6">
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Masalan: Amir Temur Samarqand"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button onClick={search}>Qidirish</Button>
        </div>
        {searchResults && (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 ? (
              <Empty text="Hech narsa topilmadi" />
            ) : (
              searchResults.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <Badge color="indigo">{r.textbook_title}</Badge>
                    {r.lesson_title && <Badge color="blue">{r.lesson_title}</Badge>}
                    <Badge color="gray">Sahifa {r.page || "~"}</Badge>
                  </div>
                  <div className="text-sm text-gray-700">{r.content.slice(0, 250)}...</div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {textbooks.length === 0 ? (
        <Card><Empty text="Darsliklar yo'q. Yuklash uchun '+' bosing." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {textbooks.map((t) => (
            <div key={t.id} onClick={() => view(t.id)} className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${sel?.id === t.id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-200"}`}>
              <div className="mb-2 flex items-center justify-between">
                <Badge color="indigo">{t.grade}-sinf</Badge>
                <div className="flex gap-1">
                  {t.has_file ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadPdf(t.id); }}
                      className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50"
                      title="PDF yuklab olish"
                    >
                      PDF
                    </button>
                  ) : null}
                  <Badge color={t.status === "verified" ? "green" : "amber"}>{t.status === "verified" ? "Tasdiqlangan" : "Qayta ishlanmoqda"}</Badge>
                </div>
              </div>
              <div className="mb-1 font-semibold text-gray-900">{t.title}</div>
              <div className="text-xs text-gray-500">
                {t.subject} · Nashr: {t.edition_year || "—"} · Sahifa: {t.pages || "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.title} wide>
        {sel && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge color="indigo">{sel.grade}-sinf</Badge>
              <Badge color="gray">{sel.subject}</Badge>
              {sel.versions?.map((v) => (
                <Badge key={v.id} color={v.is_active ? "green" : "amber"}>
                  {v.version} {v.is_active ? "(aktiv)" : "(arxiv)"}
                </Badge>
              ))}
            </div>
            {sel.versions?.length > 1 && (
              <div className="rounded-lg border border-gray-100 p-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">Versiyalar boshqaruvi</h4>
                {sel.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-gray-700">{v.version} · Holat: {v.is_active ? "aktiv" : "arxiv"}</span>
                    {!v.is_active && (
                      <Button size="sm" variant="outline" onClick={() => activateVersion(v.id)}>Aktivlashtirish</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-3">
                <h4 className="mb-1 text-sm font-semibold text-gray-700">Boblar ({sel.chapters?.length || 0})</h4>
                {(sel.chapters || []).map((c) => (
                  <div key={c.id} className="text-sm text-gray-600">{c.chapter_no}. {c.title}</div>
                ))}
                {!sel.chapters?.length && <div className="text-xs text-gray-400">Hali boblar yo'q</div>}
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <h4 className="mb-1 text-sm font-semibold text-gray-700">Tarix index</h4>
                {sel.index ? (
                  <div className="space-y-1 text-xs text-gray-600">
                    <div>Sanalar ({sel.index.dates.length}): <span className="text-gray-800">{sel.index.dates.slice(0, 8).join(", ") || "—"}</span></div>
                    <div>Shaxslar ({sel.index.people.length}): <span className="text-gray-800">{sel.index.people.slice(0, 6).join(", ") || "—"}</span></div>
                    <div>Joylar ({sel.index.places.length}): <span className="text-gray-800">{sel.index.places.slice(0, 6).join(", ") || "—"}</span></div>
                    <div>Atamalar ({sel.index.terms.length}): <span className="text-gray-800">{sel.index.terms.slice(0, 5).join(", ") || "—"}</span></div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Yuklanmoqda...</div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => downloadPdf(sel.id)}>PDF yuklab olish</Button>
              <Button variant="outline" onClick={() => setShowStructure(true)}>Bob/mavzularga ajratish</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showStructure} onClose={() => setShowStructure(false)} title="Matnni strukturaga ajratish" wide>
        <form onSubmit={structure}>
          <Field label="Darslik matni (yoki RAG orqali matn avtomatik topiladi)">
            <textarea rows={12} value={structureText} onChange={(e) => setStructureText(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Bob 1. NOM&#10;1-mavzu. NOM&#10;Matn...&#10;&#10;Bo'sh qoldirsangiz, yuklangan matn ishlatiladi" />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? "Ishlanmoqda..." : "Strukturani aniqlash"}</Button>
        </form>
      </Modal>

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Yangi darslik">
        <form onSubmit={upload}>
          <Field label="Fayl (PDF/ZIP/rasm) yoki bo'sh qoldiring">
            <input type="file" accept=".pdf,.zip,.docx,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fan"><Input value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} /></Field>
            <Field label="Sinf"><Input value={meta.grade} onChange={(e) => setMeta({ ...meta, grade: e.target.value })} /></Field>
          </div>
          <Field label="Darslik nomi"><Input required value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="Nashr yili"><Input value={meta.edition_year} onChange={(e) => setMeta({ ...meta, edition_year: e.target.value })} /></Field>
          {progress && (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Yuklanmoqda... {progress.done}/{progress.total}</span>
                <span>{Math.round((progress.done / progress.total) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div className="h-full bg-blue-600 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Yuklanmoqda..." : "Saqlash"}</Button>
        </form>
      </Modal>
    </div>
  );
}
