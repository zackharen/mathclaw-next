import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeJoinCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function generateJoinCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return output;
}
