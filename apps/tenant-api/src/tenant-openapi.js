import tenantProtocolRequestSchema from "../../../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import tenantProtocolResultSchema from "../../../schemas/v2/tenant-protocol-result.schema.json" with { type: "json" };

export const TENANT_OPENAPI_SCHEMA_VERSION = "tenant_openapi.v1";

export function createTenantOpenApiDocument(publicOrigin) {
  const origin = publicOrigin instanceof URL
    ? publicOrigin
    : new URL(publicOrigin);
  if (
    !new Set(["http:", "https:"]).has(origin.protocol) ||
    origin.username ||
    origin.password
  ) {
    throw new TypeError("Tenant OpenAPI origin is invalid");
  }
  return Object.freeze({
    openapi: "3.1.0",
    info: Object.freeze({
      title: "IPO.ONE Authenticated Tenant Protocol",
      version: "1.0.0",
      description: "One durable no-real-funds obligation protocol shared by Human and Agent entry modes."
    }),
    servers: Object.freeze([{ url: origin.origin }]),
    paths: Object.freeze({
      "/tenant/v1/operations": Object.freeze({
        post: Object.freeze({
          operationId: "executeTenantOperation",
          summary: "Execute one catalogued Tenant operation",
          security: Object.freeze([
            Object.freeze({ humanSession: [] }),
            Object.freeze({ workloadBearer: [], mutualTls: [] })
          ]),
          requestBody: Object.freeze({
            required: true,
            content: Object.freeze({
              "application/json": Object.freeze({ schema: tenantProtocolRequestSchema })
            })
          }),
          responses: Object.freeze({
            200: Object.freeze({
              description: "Authenticated protocol result",
              content: Object.freeze({
                "application/json": Object.freeze({ schema: tenantProtocolResultSchema })
              })
            }),
            400: Object.freeze({ description: "Problem Details" }),
            401: Object.freeze({ description: "Authentication required" }),
            403: Object.freeze({ description: "Authorization denied" }),
            429: Object.freeze({ description: "Admission limit reached" })
          })
        })
      }),
      "/tenant/v1/catalog": Object.freeze({
        get: Object.freeze({
          operationId: "getTenantOperationCatalog",
          summary: "Read the closed operation catalog",
          security: Object.freeze([
            Object.freeze({ humanSession: [] }),
            Object.freeze({ workloadBearer: [], mutualTls: [] })
          ]),
          responses: Object.freeze({
            200: Object.freeze({ description: "Versioned Tenant operation catalog" }),
            401: Object.freeze({ description: "Authentication required" })
          })
        })
      })
    }),
    components: Object.freeze({
      securitySchemes: Object.freeze({
        humanSession: Object.freeze({
          type: "apiKey",
          in: "cookie",
          name: "__Host-ipo_one_session"
        }),
        workloadBearer: Object.freeze({
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }),
        mutualTls: Object.freeze({ type: "mutualTLS" })
      })
    }),
    "x-ipo-one-schema-version": TENANT_OPENAPI_SCHEMA_VERSION,
    "x-ipo-one-profile": "closed_non_funds_pilot",
    "x-real-funds-enabled": false
  });
}
