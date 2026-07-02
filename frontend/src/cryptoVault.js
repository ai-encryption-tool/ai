const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function cryptoProvider() {
  const provider = globalThis.crypto;
  if (!provider?.subtle) {
    throw new Error("Web Crypto is unavailable. Open the vault on https:// or http://localhost, then reload.");
  }
  return provider;
}

async function deriveKey(passphrase, salt) {
  const provider = cryptoProvider();
  const baseKey = await provider.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return provider.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(payload, passphrase) {
  if (!passphrase) throw new Error("Enter your vault encryption passphrase.");
  const provider = cryptoProvider();
  const salt = provider.getRandomValues(new Uint8Array(16));
  const iv = provider.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await provider.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    version: 1,
  };
}

export async function decryptJson(record, passphrase) {
  if (!passphrase) throw new Error("Enter your vault encryption passphrase.");
  const provider = cryptoProvider();
  const key = await deriveKey(passphrase, base64ToBytes(record.salt));
  const plaintext = await provider.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}
