const assert = require("node:assert/strict");
const { dedupeOperationalOpinions, summarizeOperationalHotel } = require("../server").__test;

function photoOpinion(overrides = {}) {
  return {
    fileId: "photo-a",
    photoUrl: "https://example.invalid/photo-a",
    hotel: "SUEDS PREMIUM",
    dateKey: "2026-10-09",
    apartment: "425",
    guestName: "",
    checkIn: "",
    checkOut: "",
    language: "pt-BR",
    formVersion: "20260729",
    comments: "",
    highlights: "",
    issues: "",
    hasIncidentStatus: false,
    fieldScores: {
      generalImpression: 100,
      reservation: 100,
      beachClub: 75,
      wifi: 75
    },
    ...overrides
  };
}

const repeatedPhoto = photoOpinion({
  fileId: "photo-b",
  photoUrl: "https://example.invalid/photo-b",
  hasIncidentStatus: true
});
const anotherGuest = photoOpinion({
  fileId: "photo-c",
  photoUrl: "https://example.invalid/photo-c",
  guestName: "Wwashington"
});
const anotherAnswer = photoOpinion({
  fileId: "photo-d",
  photoUrl: "https://example.invalid/photo-d",
  fieldScores: {
    generalImpression: 75,
    reservation: 100,
    beachClub: 75,
    wifi: 75
  }
});
const digitalA = photoOpinion({ fileId: "digital-a", photoUrl: "", origin: "QR Code" });
const digitalB = photoOpinion({ fileId: "digital-b", photoUrl: "", origin: "QR Code" });
const unidentifiedA = photoOpinion({ fileId: "unknown-a", apartment: "", guestName: "" });
const unidentifiedB = photoOpinion({ fileId: "unknown-b", apartment: "", guestName: "" });

const deduped = dedupeOperationalOpinions([
  photoOpinion(),
  repeatedPhoto,
  anotherGuest,
  anotherAnswer,
  digitalA,
  digitalB,
  unidentifiedA,
  unidentifiedB
]);

assert.equal(deduped.length, 7, "Two identifiable photos of the same form must count once");
assert.equal(deduped[0].fileId, "photo-b", "Keep the duplicate that carries incident treatment state");
assert.ok(deduped.includes(anotherGuest), "A different guest in the same apartment must remain");
assert.ok(deduped.includes(anotherAnswer), "Different answers from the same apartment must remain");
assert.ok(deduped.includes(digitalA) && deduped.includes(digitalB), "Digital responses must not be photo-deduplicated");
assert.ok(deduped.includes(unidentifiedA) && deduped.includes(unidentifiedB), "Unidentified forms must remain separate");

const summary = summarizeOperationalHotel("SUEDS PREMIUM", deduped.slice(0, 3));
assert.equal(summary.opinions, 3);
assert.equal(summary.respondingRooms, 1);

console.log("Operational opinions: repeated photos are deduplicated without merging distinct guests or answers.");
