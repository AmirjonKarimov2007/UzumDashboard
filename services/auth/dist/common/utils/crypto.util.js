"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = require("crypto");
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
function deriveKey(secret) {
    const key = Buffer.alloc(KEY_LENGTH);
    Buffer.from(secret).copy(key);
    return key;
}
function encrypt(plaintext, secret) {
    const key = deriveKey(secret);
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
    };
}
function decrypt(encryptedHex, ivHex, tagHex, secret) {
    const key = deriveKey(secret);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
//# sourceMappingURL=crypto.util.js.map