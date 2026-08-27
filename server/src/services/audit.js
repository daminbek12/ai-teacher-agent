import db from "../db/index.js";

export function logAudit(teacherId, { action, entityType = "", entityId = 0, model = "", detail = {}, status = "ok" }) {
  try {
    db.prepare(
      `INSERT INTO audit_log (teacher_id, action, entity_type, entity_id, model, detail_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(teacherId, action, entityType, entityId, model, JSON.stringify(detail), status);
  } catch {}
}

export function getAuditLog(teacherId, { limit = 50 } = {}) {
  return db
    .prepare(`SELECT * FROM audit_log WHERE teacher_id = ? ORDER BY id DESC LIMIT ?`)
    .all(teacherId, limit)
    .map((r) => ({ ...r, detail: JSON.parse(r.detail_json) }));
}
