module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    node: process.version,
    hasGoogleSheetId: Boolean(process.env.GOOGLE_SHEET_ID),
    hasGoogleServiceAccountJson: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  });
};
