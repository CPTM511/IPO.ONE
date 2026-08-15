const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/;
const CONTENT_TYPES = new Set([
  "application/json",
  "text/csv; charset=utf-8"
]);

function invalid(message) {
  throw new Error(`official_report_download_invalid:${message}`);
}

export function decodeOfficialReportBase64(contentBase64) {
  if (
    typeof contentBase64 !== "string" ||
    contentBase64.length < 4 ||
    contentBase64.length > 174764 ||
    contentBase64.length % 4 !== 0 ||
    !BASE64_PATTERN.test(contentBase64)
  ) invalid("base64");
  let binary;
  try {
    binary = globalThis.atob(contentBase64);
  } catch {
    invalid("base64");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hexadecimal(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyOfficialReportRetrieval({
  report,
  contentBase64,
  integrityVerified,
  subtle = globalThis.crypto?.subtle
}) {
  if (
    !report ||
    report.schemaVersion !== "official_report_artifact.v1" ||
    report.effectiveStatus !== "active" ||
    report.browserAuthored !== false ||
    report.authorizationRevalidationRequired !== true ||
    report.objectAccessExpires !== true ||
    report.signedUrlIssued !== false ||
    report.piiIncluded !== false ||
    report.secretsIncluded !== false ||
    report.rawTransactionDataIncluded !== false ||
    report.productionAuthority !== false ||
    report.sandboxOnly !== true ||
    !CONTENT_TYPES.has(report.contentType) ||
    !FILE_NAME_PATTERN.test(report.fileName) ||
    !SHA256_PATTERN.test(report.contentSha256) ||
    integrityVerified !== true ||
    !subtle
  ) invalid("metadata");
  const bytes = decodeOfficialReportBase64(contentBase64);
  const digest = await subtle.digest("SHA-256", bytes);
  const contentSha256 = `sha256:${hexadecimal(digest)}`;
  if (contentSha256 !== report.contentSha256) invalid("sha256");
  return Object.freeze({
    bytes,
    contentType: report.contentType,
    fileName: report.fileName,
    contentSha256,
    officialReportId: report.officialReportId
  });
}

export function downloadVerifiedOfficialReport({
  verified,
  documentRef = globalThis.document,
  urlApi = globalThis.URL
}) {
  if (
    !(verified?.bytes instanceof Uint8Array) ||
    !CONTENT_TYPES.has(verified.contentType) ||
    !FILE_NAME_PATTERN.test(verified.fileName) ||
    !documentRef?.body ||
    typeof urlApi?.createObjectURL !== "function"
  ) invalid("transport");
  const objectUrl = urlApi.createObjectURL(new Blob([verified.bytes], {
    type: verified.contentType
  }));
  try {
    const link = documentRef.createElement("a");
    link.href = objectUrl;
    link.download = verified.fileName;
    link.hidden = true;
    documentRef.body.append(link);
    link.click();
    link.remove();
  } finally {
    urlApi.revokeObjectURL(objectUrl);
  }
}
