/**
 * Encryption at rest for sensitive integration secrets (AWS access keys,
 * external IDs, etc). AES-256-GCM keyed from AWS_CREDENTIALS_ENCRYPTION_KEY.
 *
 * The existing `integrations.credentialsEncrypted` column stores secrets in
 * plaintext despite its name — this module exists so AWS credentials do not
 * repeat that pattern.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.AWS_CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "AWS_CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and set it in the environment before " +
        "storing AWS credentials.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "AWS_CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes " +
        "(base64 of a 256-bit key).",
    );
  }
  return key;
}

// Encrypted payload format: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret payload.");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// For display only — never round-trip a real secret back to the client.
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}
