import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Badge, PageSkeleton, Empty } from "../components/ui.jsx";

const STATUS_COLORS = { ok: "success", error: "danger", warn: "warning" };

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/audit?limit=100").then((d) => { setLogs(d); setLoading(false); });
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1">Audit log</h1>
        <p className="mt-1 text-body-sm">Tizimdagi har bir avtomatik amal qayd etiladi</p>
      </div>

      <Card>
        {logs.length === 0 ? (
          <Empty icon="data" text="Hozircha amal qaydlari yo'q. Tizim ishlagani sari bu yerda ko'rinadi." />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-2.5 pr-3">Vaqt</th>
                  <th className="pb-2.5 pr-3">Amal</th>
                  <th className="pb-2.5 pr-3">Obyekt</th>
                  <th className="pb-2.5 pr-3">Model</th>
                  <th className="pb-2.5 pr-3">Holat</th>
                  <th className="pb-2.5">Tafsilot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {logs.map((log, i) => (
                  <tr key={log.id} className="stagger-item transition-colors hover:bg-stone-50/60" style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-500"><time>{(log.created_at || "").slice(0, 16).replace("T", " ")}</time></td>
                    <td className="py-2.5 pr-3 font-medium text-slate-800">{log.action}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{log.model || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <Badge color={STATUS_COLORS[log.status] || "neutral"}>{log.status}</Badge>
                    </td>
                    <td className="max-w-xs truncate py-2.5 text-slate-500">{parseDetail(log.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function parseDetail(detail) {
  try {
    const d = typeof detail === "string" ? JSON.parse(detail) : detail;
    return JSON.stringify(d);
  } catch {
    return "";
  }
}
