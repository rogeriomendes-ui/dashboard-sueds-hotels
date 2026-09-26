const assert = require("node:assert/strict");
const {
  canEditRecord,
  canUseModule,
  cleanParticipants,
  deriveTableStatus,
  participantCounts,
  publicRecord
} = require("../api/portal/reveillon-vip-tables")._test;

const admin = { id: "admin", roles: ["admin_geral"] };
const seller = { id: "seller-1", roles: ["vendedor"] };
const otherSeller = { id: "seller-2", roles: ["vendedor"] };

assert.equal(canUseModule(admin), true);
assert.equal(canUseModule(seller), true);
assert.equal(canUseModule({ id: "guest", roles: ["gestor_unidade"] }), false);
assert.equal(canEditRecord(null, seller), true);
assert.equal(canEditRecord({ status: "sold", table_type: "exclusive", reservation_number: "RES-1", owner_user_id: seller.id }, seller), false);
assert.equal(canEditRecord({ status: "sold", table_type: "shared", participants: ["Pessoa 1", "Pessoa 2"] }, seller), true);
assert.equal(canEditRecord({ status: "sold", table_type: "shared", participants: ["1", "2", "3", "4", "5"] }, seller), false);
assert.equal(canEditRecord({ status: "sold", table_type: "exclusive", reservation_number: "RES-1", owner_user_id: seller.id }, admin), true);
assert.equal(canEditRecord({ status: "blocked", owner_user_id: seller.id }, seller), true);
assert.equal(canEditRecord({ status: "blocked", owner_user_id: seller.id }, otherSeller), true);

assert.deepEqual(cleanParticipants([
  { name: " Família Silva ", reservationNumber: " RES-1 ", status: "blocked", seller: " Aline ", notes: " Perto do palco " },
  { name: "Família Souza", reservationNumber: "RES-2", status: "paid", seller: "João", notes: "" }
]), [
  { name: "Família Silva", reservationNumber: "RES-1", status: "blocked", seller: "Aline", notes: "Perto do palco" },
  { name: "Família Souza", reservationNumber: "RES-2", status: "paid", seller: "João", notes: "" }
]);

assert.equal(deriveTableStatus([], "shared"), "available");
assert.equal(deriveTableStatus([{ status: "blocked" }], "shared"), "blocked");
assert.equal(deriveTableStatus([{ status: "paid" }], "shared"), "blocked");
assert.equal(deriveTableStatus(Array.from({ length: 5 }, () => ({ status: "paid" })), "shared"), "sold");
assert.equal(deriveTableStatus([{ status: "paid" }], "exclusive"), "sold");
assert.deepEqual(participantCounts([{ status: "paid" }, { status: "blocked" }], "shared"), { occupiedSeats: 2, paidSeats: 1, blockedEntries: 1 });

assert.deepEqual(publicRecord(7, {
  status: "sold",
  table_type: "shared",
  reservation_number: "LEGADO-1",
  notes: "Observação antiga",
  participants: ["Rogerio", "Fernanda"]
}, admin).participants, [
  { name: "Rogerio", reservationNumber: "LEGADO-1", status: "paid", seller: "", notes: "Observação antiga" },
  { name: "Fernanda", reservationNumber: "LEGADO-1", status: "paid", seller: "", notes: "Observação antiga" }
]);

assert.deepEqual(publicRecord(59, null, seller), {
  number: 59,
  status: "available",
  reservationNumber: "",
  notes: "",
  ownerName: "",
  updatedByName: "",
  updatedAt: null,
  canEdit: true,
  tableType: "exclusive",
  participants: [],
  occupiedSeats: 0,
  paidSeats: 0,
  availableSeats: 5
});

console.log("Regras das mesas VIP validadas.");
