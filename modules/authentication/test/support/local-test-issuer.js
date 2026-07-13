import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair
} from "jose";
import { sha256Base64Url } from "../../src/index.js";

export class LocalTestIssuer {
  #keys = new Map();

  static async create({ issuer = "https://issuer.local.test", kid = "local-key-1" } = {}) {
    const instance = new LocalTestIssuer(issuer);
    await instance.rotate({ kid });
    return instance;
  }

  constructor(issuer) {
    this.issuer = issuer;
  }

  async rotate({ kid }) {
    const pair = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = await exportJWK(pair.publicKey);
    Object.assign(publicJwk, {
      alg: "ES256",
      kid,
      key_ops: ["verify"],
      use: "sig"
    });
    this.#keys.set(kid, { privateKey: pair.privateKey, publicJwk });
    this.activeKid = kid;
    return kid;
  }

  withdraw(kid) {
    this.#keys.delete(kid);
  }

  jwks() {
    return { keys: [...this.#keys.values()].map(({ publicJwk }) => structuredClone(publicJwk)) };
  }

  async sign({
    audience,
    subject,
    jti,
    claims = {},
    issuedAt,
    notBefore = issuedAt,
    expiresAt,
    typ,
    kid = this.activeKid
  }) {
    const key = this.#keys.get(kid);
    if (!key) throw new Error("test signing key not found");
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid, typ })
      .setIssuer(this.issuer)
      .setSubject(subject)
      .setAudience(audience)
      .setIssuedAt(issuedAt)
      .setNotBefore(notBefore)
      .setExpirationTime(expiresAt)
      .setJti(jti)
      .sign(key.privateKey);
  }
}
export async function createDpopFixture() {
  const pair = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(pair.publicKey);
  Object.assign(publicJwk, { alg: "ES256", key_ops: ["verify"], use: "sig" });
  const thumbprint = await calculateJwkThumbprint(publicJwk, "sha256");
  return {
    publicJwk,
    thumbprint,
    async sign({ accessToken, method, url, jti, issuedAt }) {
      return new SignJWT({
        htm: method.toUpperCase(),
        htu: url,
        iat: issuedAt,
        jti,
        ath: sha256Base64Url(accessToken)
      })
        .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicJwk })
        .sign(pair.privateKey);
    }
  };
}
