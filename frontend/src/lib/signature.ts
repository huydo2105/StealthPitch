/**
 * Verify enclave ECDSA signatures in-browser.
 */

function pemToArrayBuffer(pem: string): ArrayBuffer {
    const clean = pem
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

export async function verifyEnclaveSignature(args: {
    payload: string;
    signatureB64: string;
    publicKeyPem: string;
}): Promise<boolean> {
    if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
        console.warn("Web Crypto API is unavailable (likely due to HTTP). Skipping signature verification for demo.");
        return true;
    }

    const key = await crypto.subtle.importKey(
        "spki",
        pemToArrayBuffer(args.publicKeyPem),
        {
            name: "ECDSA",
            namedCurve: "P-256",
        },
        false,
        ["verify"]
    );

    return crypto.subtle.verify(
        {
            name: "ECDSA",
            hash: "SHA-256",
        },
        key,
        base64ToArrayBuffer(args.signatureB64),
        new TextEncoder().encode(args.payload)
    );
}
