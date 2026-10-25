import { getDb } from "../_db.js";
import { answerCallback, editMessage, buildApprovedMessage, buildDeniedMessage, buildRedirectedMessage } from "../_telegram.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  try {
    var body = req.body;

    if (!body.callback_query) {
      return res.status(200).json({ ok: true });
    }

    var callbackId = body.callback_query.id;
    var data = body.callback_query.data;
    var message = body.callback_query.message;
    if (!data || !message) {
      return res.status(200).json({ ok: true });
    }

    var parts = data.split(":");
    var action = parts[0];
    var taskId = parts[1];
    if (!taskId || (action !== "approve" && action !== "deny" && action !== "redirect")) {
      return res.status(200).json({ ok: true });
    }

    var chatId = message.chat.id;
    var status = action === "approve" ? "approved" : action === "redirect" ? "redirected" : "denied";

    var sql = getDb();
    var rows = await sql`
      UPDATE pending_logins
      SET status = ${status},
          resolved_at = ${Date.now()},
          resolved_by = 'telegram'
      WHERE id = ${taskId} AND status = 'pending'
      RETURNING *
    `;

    if (rows.length === 0) {
      await answerCallback(chatId, callbackId, "Already handled or not found");
      return res.status(200).json({ ok: true });
    }

    var task = rows[0];
    await answerCallback(chatId, callbackId, status.charAt(0).toUpperCase() + status.slice(1));

    var updatedText = status === "approved"
      ? buildApprovedMessage(task)
      : status === "redirected"
      ? buildRedirectedMessage(task)
      : buildDeniedMessage(task);
    await editMessage(chatId, message.message_id, updatedText);

    return res.status(200).json({ ok: true, handled: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return res.status(500).json({ error: "Webhook error" });
  }
}
