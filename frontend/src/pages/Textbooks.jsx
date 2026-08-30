import React, { useEffect, useState } from "react";
import { api, downloadBlob } from "../api.js";
import { Card, Button, Modal, Field, Input, Badge, PageSkeleton, Empty } from "../components/ui.jsx";
import { useToast } from "../components/Toast.jsx";

// Bepul PDF darsliklar havolalari (infoedu.uz — TAS-IX, bepul)
const FREE_TEXTBOOK_LINKS = {
  "5|Tarixdan hikoyalar": "5-sinf-tarixdan-hikoyalar",
  "6|Tarix": "6-sinf-qadimgi-dunyo-tarixi",
  "7|O'zbekiston tarixi": "7-sinf-ozbekiston-tarixi",
  "7|Jahon tarixi": "7-sinf-jahon-tarixi",
  "8|O'zbekiston tarixi": "8-sinf-ozbekiston-tarixi",
  "8|Jahon tarixi": "8-sinf-jahon-tarixi",
  "9|O'zbekiston tarixi": "9-sinf-ozbekiston-tarixi",
  "9|Jahon tarixi": "9-sinf-jahon-tarixi",
  "10|O'zbekiston tarixi": "10-sinf-ozbekiston-tarixi",
  "10|Jahon tarixi": "10-sinf-jahon-tarixi",
  "11|O'zbekiston tarixi": "11-sinf-ozbekiston-tarixi",
  "11|Jahon tarixi": "11-sinf-jahon-tarixi",
};

// Qo'shimcha bepul manba: ZiyoNET kutubxonasi (darslik topilmasa)
const LIBRARY_SEARCH_URL = "https://library.ziyonet.uz";

function freeTextbookUrl(grade, subject) {
  const slug = FREE_TEXTBOOK_LINKS[`${grade}|${subject || ""}`];
  return slug ? `https://infoedu.uz/darsliklar/${grade}/${slug}` : null;
}

export default function Textbooks() {
  const toast = useToast();
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
      toast.error(err.message);
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
      try {
        const tb = await api("/textbooks", { method: "POST", body: { ...meta, version: `v${meta.edition_year || "1"}` } });
        setTextbooks((p) => [tb, ...p]);
        setShowUpload(false);
        setMeta({ subject: "Tarix", grade: "7", title: "", edition_year: "" });
        toast.success("Darslik yaratildi");
      } catch (err) {
        toast.error(err.message);
      }
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
      toast.success(`Darslik yuklandi: ${result.extracted_chars} belgi, ${result.pages} sahifa. Endi bob/mavzularga ajrating.`);
      await load();
      setShowUpload(false);
      setFile(null);
      setProgress(null);
    } catch (err) {
      toast.error(err.message);
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
      toast.success(`Struktura aniqlandi: ${result.chapters} bob, ${result.lessons} mavzu, ${result.chunks} chunk`);
      setShowStructure(false);
      setStructureText("");
      view(sel.id);
      load();
    } catch (err) {
      toast.error(err.message);
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

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1">Darsliklar</h1>
          <p className="mt-1 text-body-sm">PDF/ZIP/rasm yuklash, bob/mavzular, RAG index</p>
        </div>
        <Button onClick={() => setShowUpload(true)} icon="M12 4v16m8-8H4">Darslik qo'shish</Button>
      </div>

      <Card title="RAG qidiruv" subtitle="Darsliklar bo'yicha semantic qidiruv">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="tb-search" className="sr-only">Qidiruv</label>
          <input
            id="tb-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Masalan: Amir Temur Samarqand"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition-colors hover:border-stone-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <Button onClick={search} icon="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" className="sm:w-auto">Qidirish</Button>
        </div>
        {searchResults && (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 ? (
              <Empty icon="search" text="Hech narsa topilmadi. Boshqa kalit so'z bilan qidirib ko'ring." />
            ) : (
              searchResults.map((r) => (
                <div key={r.id} className="rounded-lg border border-stone-100 bg-stone-50 p-3.5 transition-colors hover:border-primary-200">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <Badge color="primary">{r.textbook_title}</Badge>
                    {r.lesson_title && <Badge color="neutral">{r.lesson_title}</Badge>}
                    <Badge color="neutral">Sahifa {r.page || "~"}</Badge>
                  </div>
                  <div className="text-sm leading-relaxed text-slate-700">{r.content.slice(0, 250)}...</div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {textbooks.length === 0 ? (
        <Card>
          <Empty
            icon="data"
            text="Darsliklar hali yuklanmagan. PDF yoki ZIP faylni yuklab boshlang."
            action={<Button size="sm" onClick={() => setShowUpload(true)}>Darslik yuklash</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {textbooks.map((t, i) => (
            <div
              key={t.id}
              onClick={() => view(t.id)}
              onKeyDown={(e) => e.key === "Enter" && view(t.id)}
              role="button"
              tabIndex={0}
              aria-label={`${t.title} darsligini ko'rish`}
              className={`stagger-item cursor-pointer rounded-xl border bg-white p-4 shadow-card outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-primary-500 ${sel?.id === t.id ? "border-primary-600 ring-2 ring-primary-100" : "border-stone-200 hover:border-primary-300"}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge color="primary">{t.grade}-sinf</Badge>
                <div className="flex gap-1.5">
                  {t.has_file ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadPdf(t.id); }}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50"
                      title="PDF yuklab olish"
                      aria-label={`${t.title} PDF yuklab olish`}
                    >
                      PDF
                    </button>
                  ) : null}
                  <Badge color={t.status === "verified" ? "success" : "warning"}>{t.status === "verified" ? "Tasdiqlangan" : "Qayta ishlanmoqda"}</Badge>
                </div>
              </div>
              <div className="mb-1 font-semibold text-slate-900">{t.title}</div>
              <div className="text-caption">
                {t.subject} · Nashr: {t.edition_year || "—"} · Sahifa: {t.pages || "—"}
              </div>
              {freeTextbookUrl(t.grade, t.subject) ? (
                <a
                  href={freeTextbookUrl(t.grade, t.subject)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800 transition-all duration-150 hover:border-primary-300 hover:bg-primary-100 active:scale-[0.98]"
                  aria-label={`${t.title} darsligini bepul yuklash (yangi oyna)`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Bepul yuklab olish
                </a>
              ) : (
                <a
                  href={LIBRARY_SEARCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-150 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 active:scale-[0.98]"
                  aria-label={`${t.title} darsligini kutubxonadan qidirish (yangi oyna)`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Kutubxonadan qidirish
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.title} wide>
        {sel && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge color="primary">{sel.grade}-sinf</Badge>
              <Badge color="neutral">{sel.subject}</Badge>
              {sel.versions?.map((v) => (
                <Badge key={v.id} color={v.is_active ? "success" : "warning"}>
                  {v.version} {v.is_active ? "(aktiv)" : "(arxiv)"}
                </Badge>
              ))}
            </div>
            {sel.versions?.length > 1 && (
              <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-3.5">
                <h4 className="text-h3 mb-2">Versiyalar boshqaruvi</h4>
                {sel.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-slate-700">{v.version} · Holat: {v.is_active ? "aktiv" : "arxiv"}</span>
                    {!v.is_active && (
                      <Button size="sm" variant="outline" onClick={() => activateVersion(v.id)}>Aktivlashtirish</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-stone-50 p-3.5">
                <h4 className="text-h3 mb-1.5">Boblar ({sel.chapters?.length || 0})</h4>
                {(sel.chapters || []).map((c) => (
                  <div key={c.id} className="text-sm text-slate-600">{c.chapter_no}. {c.title}</div>
                ))}
                {!sel.chapters?.length && <div className="text-caption">Hali boblar yo'q</div>}
              </div>
              <div className="rounded-lg bg-stone-50 p-3.5">
                <h4 className="text-h3 mb-1.5">Tarix index</h4>
                {sel.index ? (
                  <div className="space-y-1 text-xs text-slate-600">
                    <div>Sanalar ({sel.index.dates.length}): <span className="text-slate-800">{sel.index.dates.slice(0, 8).join(", ") || "—"}</span></div>
                    <div>Shaxslar ({sel.index.people.length}): <span className="text-slate-800">{sel.index.people.slice(0, 6).join(", ") || "—"}</span></div>
                    <div>Joylar ({sel.index.places.length}): <span className="text-slate-800">{sel.index.places.slice(0, 6).join(", ") || "—"}</span></div>
                    <div>Atamalar ({sel.index.terms.length}): <span className="text-slate-800">{sel.index.terms.slice(0, 5).join(", ") || "—"}</span></div>
                  </div>
                ) : (
                  <div className="text-caption">Yuklanmoqda...</div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {sel.has_file && <Button variant="outline" onClick={() => downloadPdf(sel.id)}>PDF yuklab olish</Button>}
              {freeTextbookUrl(sel.grade, sel.subject) && (
                <a
                  href={freeTextbookUrl(sel.grade, sel.subject)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primary-800 active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Bepul yuklab olish
                </a>
              )}
              <Button variant="outline" onClick={() => setShowStructure(true)}>Bob/mavzularga ajratish</Button>
            </div>
            {freeTextbookUrl(sel.grade, sel.subject) && (
              <p className="text-caption">Havola infoedu.uz saytiga yuklatadi — darsliklar bepul, TAS-IX serverida joylashgan.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showStructure} onClose={() => setShowStructure(false)} title="Matnni strukturaga ajratish" wide>
        <form onSubmit={structure} className="space-y-4">
          <Field label="Darslik matni (yoki RAG orqali matn avtomatik topiladi)" htmlFor="tb-structure">
            <textarea
              id="tb-structure"
              rows={12}
              value={structureText}
              onChange={(e) => setStructureText(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition-colors hover:border-stone-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="Bob 1. NOM&#10;1-mavzu. NOM&#10;Matn...&#10;&#10;Bo'sh qoldirsangiz, yuklangan matn ishlatiladi"
            />
          </Field>
          <Button type="submit" loading={busy}>Strukturani aniqlash</Button>
        </form>
      </Modal>

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Yangi darslik">
        <form onSubmit={upload} className="space-y-4">
          <Field label="Fayl (PDF/ZIP/DOCX/JSON/rasm) yoki bo'sh qoldiring" htmlFor="tb-file">
            <input
              id="tb-file"
              type="file"
              accept=".pdf,.zip,.docx,.json,.txt,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-700 hover:border-stone-400"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fan" htmlFor="tb-subject"><Input id="tb-subject" value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} /></Field>
            <Field label="Sinf" htmlFor="tb-grade"><Input id="tb-grade" value={meta.grade} onChange={(e) => setMeta({ ...meta, grade: e.target.value })} /></Field>
          </div>
          <Field label="Darslik nomi" htmlFor="tb-title"><Input id="tb-title" required value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="Nashr yili" htmlFor="tb-year"><Input id="tb-year" value={meta.edition_year} onChange={(e) => setMeta({ ...meta, edition_year: e.target.value })} /></Field>
          {progress && (
            <div>
              <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-600">
                <span>Yuklanmoqda... {progress.done}/{progress.total}</span>
                <span>{Math.round((progress.done / progress.total) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={Math.round((progress.done / progress.total) * 100)} aria-valuemin="0" aria-valuemax="100">
                <div className="h-full rounded-full bg-primary-600 transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          <Button type="submit" loading={busy} className="w-full">{busy ? "Yuklanmoqda..." : "Saqlash"}</Button>
        </form>
      </Modal>
    </div>
  );
}
