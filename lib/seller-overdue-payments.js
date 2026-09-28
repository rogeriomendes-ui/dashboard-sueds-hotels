function overduePaymentsForSeller(records, seller, todayKey) {
  const sellerKey = String(seller || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!sellerKey || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey || "")) return [];
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  const seen = new Set();
  return records.filter((record) => {
    const recordSeller = String(record.seller || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (recordSeller !== sellerKey || Number(record.remaining) <= 0) return false;
    if (String(record.status || "").trim().toLowerCase() === "cancelada") return false;
    const dateKey = record.dateKey;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return false;
    const ageDays = Math.floor((today - Date.parse(`${dateKey}T00:00:00Z`)) / 86400000);
    if (ageDays <= 30) return false;
    const identity = `${String(record.reservationCode || "").trim().toLowerCase()}|${String(record.hotel || "").trim().toLowerCase()}`;
    if (identity === "|" || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map((record) => ({
    reservationCode: record.reservationCode,
    hotel: record.hotel,
    saleDate: record.dateKey,
    amount: record.remaining,
    daysSinceSale: Math.floor((today - Date.parse(`${record.dateKey}T00:00:00Z`)) / 86400000),
    status: "Atrasado"
  })).sort((a, b) => b.daysSinceSale - a.daysSinceSale || a.reservationCode.localeCompare(b.reservationCode));
}

module.exports = { overduePaymentsForSeller };
