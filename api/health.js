module.exports = function handler(req, res) {
  const hasGoogleServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  );
  const googleAdsConfigured = Boolean(
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN
  );
  const metaAdsConfigured = Boolean(
    process.env.META_ADS_ACCOUNT_ID &&
    process.env.META_ADS_ACCESS_TOKEN
  );

  res.status(200).json({
    ok: true,
    googleConfigured: Boolean(process.env.GOOGLE_SHEET_ID && hasGoogleServiceAccount),
    analyticsConfigured: Boolean(
      (process.env.GOOGLE_ANALYTICS_SITE_PROPERTY_ID ||
        process.env.GOOGLE_ANALYTICS_PROPERTY_ID ||
        process.env.GOOGLE_ANALYTICS_OMNIBEES_PROPERTY_ID) &&
      hasGoogleServiceAccount
    ),
    googleAdsConfigured,
    metaAdsConfigured,
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    gestoresProtected: Boolean(process.env.GESTORES_ACCESS_TOKEN),
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 60)
  });
};
