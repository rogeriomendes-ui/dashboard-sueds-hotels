module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    googleConfigured: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 60)
  });
};
