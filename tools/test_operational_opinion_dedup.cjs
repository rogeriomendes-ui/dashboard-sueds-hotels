const assert = require("node:assert/strict");
const {
  dedupeOperationalOpinions,
  operationalOpinionDeviceApartmentCounts,
  operationalOpinionResponse,
  summarizeOperationalHotel
} = require("../server").__test;

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

const qrOpinions = [
  photoOpinion({ fileId: "qr-1", photoUrl: "", origin: "QR Code", deviceId: "device-a", apartment: "425" }),
  photoOpinion({ fileId: "qr-2", photoUrl: "", origin: "QR Code", deviceId: "device-a", apartment: "425" }),
  photoOpinion({ fileId: "qr-3", photoUrl: "", origin: "QR Code", deviceId: "device-a", apartment: "309" }),
  photoOpinion({ fileId: "qr-4", photoUrl: "", origin: "QR Code", deviceId: "device-b", apartment: "407" }),
  photoOpinion({ fileId: "qr-5", photoUrl: "", origin: "QR Code", deviceId: "device-a", apartment: "408", dateKey: "2026-10-10" })
];
const deviceCounts = operationalOpinionDeviceApartmentCounts(qrOpinions);
const flagged = operationalOpinionResponse(qrOpinions[0], 0, deviceCounts);
const sameDayOtherDevice = operationalOpinionResponse(qrOpinions[3], 3, deviceCounts);
const nextDay = operationalOpinionResponse(qrOpinions[4], 4, deviceCounts);
assert.equal(flagged.suspiciousDevice, true, "The same device across different apartments on one day must be flagged");
assert.equal(flagged.deviceApartmentCount, 2, "Repeated responses for the same apartment must count as one apartment");
assert.equal(sameDayOtherDevice.suspiciousDevice, false, "A device used for one apartment must not be flagged");
assert.equal(nextDay.suspiciousDevice, false, "Device activity must be evaluated separately per day");

console.log("Operational opinions: photo deduplication and anonymous multi-apartment device alerts are valid.");
