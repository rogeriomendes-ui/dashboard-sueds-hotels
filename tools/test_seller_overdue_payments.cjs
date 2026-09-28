const assert = require("node:assert/strict");
const { overduePaymentsForSeller } = require("../lib/seller-overdue-payments");

const row = (reservationCode, dateKey, remaining, seller = "Amanda Melgaco", status = "Confirmada", hotel = "SUEDS PLAZA") => ({
  reservationCode, dateKey, remaining, seller, status, hotel
});
const payments = overduePaymentsForSeller([
  row("old", "2026-08-27", 250),
  row("exactly-30", "2026-08-29", 100),
  row("paid", "2026-08-01", 0),
  row("cancelled", "2026-08-01", 200, "Amanda Melgaco", "Cancelada"),
  row("other-seller", "2026-08-01", 300, "Aline Nunes"),
  row("old", "2026-08-27", 250),
  row("same-code-other-hotel", "2026-08-01", 50, "Amanda Melgaco", "Pendente", "SUEDS PREMIUM")
], "Amanda Melgaco", "2026-09-28");

assert.deepEqual(payments.map((payment) => payment.reservationCode), ["same-code-other-hotel", "old"]);
assert.equal(payments[0].status, "Atrasado");
assert.equal(payments[1].daysSinceSale, 32);
assert.deepEqual(overduePaymentsForSeller([row("old", "2026-08-01", 250)], "", "2026-09-28"), []);
console.log("Overdue seller payments: OK");
