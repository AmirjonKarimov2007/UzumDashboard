export declare function encrypt(plaintext: string, secret: string): {
    encrypted: string;
    iv: string;
    tag: string;
};
export declare function decrypt(encryptedHex: string, ivHex: string, tagHex: string, secret: string): string;
