# MCP-P0 dependency review — adoption deferred

Status: **not admitted**. The current local candidate retains the original
stdio server and original dependency lockfile. It adds inventory/drift and
framing admission tests. It does not depend on the official MCP SDK.
The rejected SDK experiment remains preserved separately in local evidence.

## Official package evaluation

The [AAIF project list](https://aaif.io/projects) and
[official SDK v2.4.0 release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0)
were reviewed. Server/client/core 2.4.0 are free public packages. Exact public
exports, registry integrity, installed source and license were checked; scripts
were disabled. No model, paid API, external service or production authority was
required. The supplied 2026-07-28 migration page could not be retrieved (web
error/native HTTP403); no claim that it was read is made.

The experiment used the public Server and StdioServerTransport APIs with only
2025-06-18 enabled and one Server per connection. serveStdio is a per-connection
era selector, not HTTP per-request lifecycle. No modern era was admitted.

## Compatibility admission failure

The predeclared old contract counts bytes per completed line, excluding the
newline, permits 65,536 bytes, returns -32700 for malformed JSON and -32600 for
an oversized completed line, and continues on the same connection. Coalesced
messages and fragmented UTF-8 must retain the same behavior.

Five explicit tests were run unchanged against both candidates. SDK framing
failed the exact-limit line, coalesced messages, malformed/recovery and
oversize/recovery cases; it passed fragmentation (1/5). Restoring the original
transport passed all five. The SDK exposes maxBufferSize, not a syntax-error
callback or per-line recovery option. Its private ReadBuffer discards JSON
syntax errors and checks accumulated chunk bytes before parsing; overflow
closes the connection. Raising the buffer cap does not restore per-line limits
or error recovery. A custom parser, oversized-line drain and routing shim would
rebuild substantial transport behavior. That work is deferred rather than
silently accepting connection-close behavior or unbounded new buffering.
The original implementation is retained unchanged, including its existing
limitations; these tests do not claim to harden its unterminated-line buffering.

## License evidence retained

The npm metadata says Apache-2.0, but the full
[upstream LICENSE](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/LICENSE)
states an MIT-to-Apache-2.0 transition. New contributions and contributions with
relicensing consent use Apache-2.0; historical contributions without consent
remain MIT. Documentation other than specifications uses CC-BY-4.0. Future
adoption must preserve the complete license and notices; do not flatten this
into one license. No SDK source is vendored or relicensed here.

## Security findings remain unwaived

The experiment's full audit recorded nine advisories: four high, two moderate,
three low. Production-only reported seven: three high, two moderate, two low.
Existing paths include tmp 0.0.33 via development solc, follow-redirects 1.16.0,
zod 3.22.4/3.25.76 in wallet dependencies, and fast-uri 3.1.8 via API-contract
Ajv. No broad dependency upgrade was attempted.

Separately, SDK 2.4.0 bundles Ajv with fast-uri 3.1.8. That newly introduced
bundled code is not cleared by the lack of a new MCP path in package audit.
Static trusted schemas limit a route but do not prove an exact safe mitigation.
**SDK-bundled fast-uri is a release blocker** until an exact safe mitigation or
an upstream fixed package is evidenced. The current narrower candidate removes
the SDK dependency; it does not fix or waive the existing dependency findings.

Upstream HTTP advisories fixed before 2.4.0 were reviewed, but those fixes do
not resolve these framing or bundled-code blockers. Raw audit reports and all
failed/successful experiment logs are retained in the private implementation evidence.
