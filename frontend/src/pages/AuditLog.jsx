import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Badge, Spinner, Empty } from "../components/ui.jsx";

const STATUS_COLORS = { ok: "green", error: "red", warn: "amber" };

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/audit?limit=100").then((d) => { setLogs(d); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit log</h1>
        <p className="text-sm text-gray-500">Tizimdagi har bir avtomatik amal qayd etiladi</p>
      </div>

      <Card>
        {logs.length === 0 ? (
          <Empty text="Hozircha amal qaydlari yo'q" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400">
                  <th className="pb-2">Vaqt</th>
                  <th className="pb-2">Amal</th>
                  <th className="pb-2">Obyekt</th>
                  <th className="pb-2">Model</th>
                  <th className="pb-2">Holat</th>
                  <th className="pb-2">Tafsilot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 text-gray-500">{log.created_at}</td>
                    <td className="py-2.5 font-medium text-gray-800">{log.action}</td>
                    <td className="py-2.5 text-gray-600">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}</td>
                    <td className="py-2.5 text-gray-500">{log.model || "—"}</td>
                    <td className="py-2.5">
                      <Badge color={STATUS_COLORS[log.status] || "gray"}>{log.status}</Badge>
                    </td>
                    <td className="py-2.5 max-w-xs truncate text-gray-500">{parseDetail(log.detail)}</td>
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
