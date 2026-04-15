import { createVerify, X509Certificate } from "node:crypto";

/**
 * AWS SNS 메시지 서명 검증 (SignatureVersion 1·2 지원).
 * 참조: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 *
 * - SigningCertURL은 반드시 `sns.*.amazonaws.com` (또는 sns-fips) 도메인
 * - canonical string을 AWS 스펙대로 조립 → 서명 verify
 * - Timestamp가 1시간 이상 지난 메시지는 거부 (replay 방지)
 */

const ALLOWED_HOST_RE =
  /^sns(-fips)?\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;

const CERT_CACHE = new Map<string, { pem: string; expiresAt: number }>();
const CERT_TTL_MS = 60 * 60 * 1000;

const MAX_MESSAGE_AGE_MS = 60 * 60 * 1000;

export interface SnsMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Message?: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
}

export class SnsVerifyError extends Error {}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new SnsVerifyError(msg);
}

async function fetchCert(url: string): Promise<string> {
  const cached = CERT_CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.pem;

  const res = await fetch(url);
  if (!res.ok) {
    throw new SnsVerifyError(`cert fetch failed: ${res.status}`);
  }
  const pem = await res.text();
  CERT_CACHE.set(url, { pem, expiresAt: Date.now() + CERT_TTL_MS });
  return pem;
}

function canonicalString(msg: SnsMessage): string {
  const fields: string[] = [];
  if (msg.Type === "Notification") {
    fields.push("Message", msg.Message ?? "");
    fields.push("MessageId", msg.MessageId);
    if (msg.Subject) fields.push("Subject", msg.Subject);
    fields.push("Timestamp", msg.Timestamp);
    fields.push("TopicArn", msg.TopicArn);
    fields.push("Type", msg.Type);
  } else if (
    msg.Type === "SubscriptionConfirmation" ||
    msg.Type === "UnsubscribeConfirmation"
  ) {
    fields.push("Message", msg.Message ?? "");
    fields.push("MessageId", msg.MessageId);
    fields.push("SubscribeURL", msg.SubscribeURL ?? "");
    fields.push("Timestamp", msg.Timestamp);
    fields.push("Token", msg.Token ?? "");
    fields.push("TopicArn", msg.TopicArn);
    fields.push("Type", msg.Type);
  } else {
    throw new SnsVerifyError(`unsupported Type: ${msg.Type}`);
  }
  return fields.join("\n") + "\n";
}

export async function verifySnsMessage(msg: SnsMessage): Promise<void> {
  assert(
    msg.SignatureVersion === "1" || msg.SignatureVersion === "2",
    `unsupported SignatureVersion: ${msg.SignatureVersion}`,
  );
  assert(msg.Signature, "missing Signature");
  assert(msg.SigningCertURL, "missing SigningCertURL");

  let certUrl: URL;
  try {
    certUrl = new URL(msg.SigningCertURL);
  } catch {
    throw new SnsVerifyError("invalid SigningCertURL");
  }
  assert(certUrl.protocol === "https:", "SigningCertURL not https");
  assert(
    ALLOWED_HOST_RE.test(certUrl.hostname),
    `SigningCertURL host not allowed: ${certUrl.hostname}`,
  );
  assert(certUrl.pathname.endsWith(".pem"), "SigningCertURL not .pem");

  const ts = Date.parse(msg.Timestamp);
  assert(Number.isFinite(ts), "invalid Timestamp");
  assert(
    Math.abs(Date.now() - ts) < MAX_MESSAGE_AGE_MS,
    "message too old (replay?)",
  );

  const pem = await fetchCert(msg.SigningCertURL);
  const cert = new X509Certificate(pem);

  const algo = msg.SignatureVersion === "1" ? "SHA1" : "SHA256";
  const canonical = canonicalString(msg);

  const verifier = createVerify(algo);
  verifier.update(canonical, "utf8");
  verifier.end();

  const sigBuf = Buffer.from(msg.Signature, "base64");
  const ok = verifier.verify(cert.publicKey, sigBuf);
  if (!ok) throw new SnsVerifyError("signature invalid");
}
