import { getDb } from "../_db.js";

var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(res, data, status) {
  res.setHeader("Content-Type", "application/json");
  for (var k in cors) res.setHeader(k, cors[k]);
  res.status(status || 200).json(data);
}

export default async function handler(req, res) {
  var id = req.query.id;

  if (req.method === "OPTIONS") {
    for (var k in cors) res.setHeader(k, cors[k]);
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      var sql = getDb();
      var rows = await sql`SELECT * FROM pending_logins WHERE id = ${id}`;
      if (rows.length === 0) return json(res, { error: "Task not found" }, 404);
      return json(res, { task: rows[0] });
    } catch (error) {
      console.error("GET /api/tasks/[id] error:", error);
      return json(res, { error: "Failed to fetch task" }, 500);
    }
  }

  if (req.method === "PATCH") {
    try {
      var body = req.body;
      var status = body.status;
      var resolved_by = body.resolved_by || "admin";
      var validStatuses = ["approved", "denied", "redirected"];

      if (validStatuses.indexOf(status) === -1) {
        return json(res, { error: "status must be one of: " + validStatuses.join(", ") }, 400);
      }

      var sql = getDb();
      var rows = await sql`
        UPDATE pending_logins
        SET status = ${status},
            resolved_at = ${Date.now()},
            resolved_by = ${resolved_by}
        WHERE id = ${id}
        RETURNING *
      `;

      if (rows.length === 0) return json(res, { error: "Task not found" }, 404);
      return json(res, { task: rows[0] });
    } catch (error) {
      console.error("PATCH /api/tasks/[id] error:", error);
      return json(res, { error: "Failed to update task" }, 500);
    }
  }

  return json(res, { error: "Method not allowed" }, 405);
}
