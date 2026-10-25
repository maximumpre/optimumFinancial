export default function handler(req, res) {
  var dbSet = !!process.env.DATABASE_URL;
  res.status(200).json({
    database_url_set: dbSet,
    database_url_preview: dbSet ? process.env.DATABASE_URL.substring(0, 30) + "..." : "(not set)",
    status: "ok"
  });
}
