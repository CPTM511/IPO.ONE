import tenantProtocolRequestSchema from "../../../schemas/v2/tenant-protocol-request.schema.json" with { type: "json" };
import tenantProtocolResultSchema from "../../../schemas/v2/tenant-protocol-result.schema.json" with { type: "json" };
import { TENANT_PROTOCOL_OPERATIONS } from "../../../packages/api-contract/src/index.js";

export const TENANT_OPENAPI_SCHEMA_VERSION = "tenant_openapi.v1";
export const AGENT_HTTPS_OPENAPI_SCHEMA_VERSION = "agent_https_openapi.v1";
export const WALLET_EXECUTION_OPENAPI_OPERATION_IDS = Object.freeze(
  TENANT_PROTOCOL_OPERATIONS
    .map(({ operationId }) => operationId)
    .filter((operationId) => operationId.startsWith("wallet"))
);
export const VENUE_EXECUTION_OPENAPI_OPERATION_IDS = Object.freeze(
  TENANT_PROTOCOL_OPERATIONS
    .map(({ operationId }) => operationId)
    .filter((operationId) => operationId.startsWith("venue"))
);

const PROBLEM_DETAILS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze([
    "type",
    "title",
    "status",
    "detail",
    "instance",
    "code",
    "requestId",
    "schemaVersion"
  ]),
  properties: Object.freeze({
    type: Object.freeze({ type: "string", pattern: "^urn:ipo-one:problem:[a-z][a-z0-9_]{1,95}$" }),
    title: Object.freeze({ type: "string", minLength: 1, maxLength: 128 }),
    status: Object.freeze({ type: "integer", minimum: 400, maximum: 599 }),
    detail: Object.freeze({ type: "string", minLength: 1, maxLength: 1_024 }),
    instance: Object.freeze({ type: "string", pattern: "^urn:ipo-one:request:" }),
    code: Object.freeze({ type: "string", pattern: "^[a-z][a-z0-9_]{1,95}$" }),
    requestId: Object.freeze({
      type: "string",
      minLength: 8,
      maxLength: 128,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]+$"
    }),
    retryAfterClass: Object.freeze({
      enum: Object.freeze(["manual", "short", "long"])
    }),
    schemaVersion: Object.freeze({ const: "problem_details.v1" })
  })
});

const CHAIN_CAPABILITY_DOCUMENT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: Object.freeze(["schemaVersion", "deployment", "chainEvidence", "safety"]),
  properties: Object.freeze({
    schemaVersion: Object.freeze({ const: "ipo_one_deployment_capability.v1" }),
    chainEvidence: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze([
        "status",
        "reasonCode",
        "currentUserWritesEnabled",
        "hashOnly",
        "network",
        "contractAddress",
        "transactionSubmissionConfigured",
        "observationConfigured",
        "finalityConfigured",
        "reconciliationConfigured",
        "historicalArtifactsAreCurrentUserEvidence",
        "lifecycleStates",
        "releaseId",
        "schemaVersion"
      ]),
      properties: Object.freeze({
        status: Object.freeze({ enum: Object.freeze(["ENABLED", "DISABLED"]) }),
        reasonCode: Object.freeze({ type: "string", minLength: 1, maxLength: 96 }),
        currentUserWritesEnabled: Object.freeze({ type: "boolean" }),
        hashOnly: Object.freeze({ const: true }),
        network: Object.freeze({ type: ["string", "null"] }),
        contractAddress: Object.freeze({ type: ["string", "null"] }),
        transactionSubmissionConfigured: Object.freeze({ type: "boolean" }),
        observationConfigured: Object.freeze({ type: "boolean" }),
        finalityConfigured: Object.freeze({ type: "boolean" }),
        reconciliationConfigured: Object.freeze({ type: "boolean" }),
        historicalArtifactsAreCurrentUserEvidence: Object.freeze({ const: false }),
        lifecycleStates: Object.freeze({
          type: "array",
          prefixItems: Object.freeze([
            Object.freeze({ const: "queued" }),
            Object.freeze({ const: "submitted" }),
            Object.freeze({ const: "observed" }),
            Object.freeze({ const: "finalized" }),
            Object.freeze({ const: "reconciled" }),
            Object.freeze({ const: "failed" })
          ]),
          minItems: 6,
          maxItems: 6
        }),
        releaseId: Object.freeze({ type: "string", pattern: "^[0-9a-f]{40}$" }),
        schemaVersion: Object.freeze({ const: "ipo_one_chain_capability.v1" })
      })
    })
  })
});

const SECURED_POOL_MARKET_SNAPSHOT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: Object.freeze([
    "market",
    "submission",
    "serverDerived",
    "syntheticOnly",
    "productionFundsMoved",
    "schemaVersion"
  ]),
  properties: Object.freeze({
    market: Object.freeze({ type: "object", additionalProperties: true }),
    submission: Object.freeze({
      type: "object",
      additionalProperties: true,
      required: Object.freeze(["state", "reasonCode", "transactionHash"]),
      properties: Object.freeze({
        state: Object.freeze({ const: "unavailable" }),
        reasonCode: Object.freeze({ const: "pool_submission_unavailable" }),
        transactionHash: Object.freeze({ type: "null" })
      })
    }),
    serverDerived: Object.freeze({ const: true }),
    syntheticOnly: Object.freeze({ const: true }),
    productionFundsMoved: Object.freeze({ const: false }),
    schemaVersion: Object.freeze({ const: "secured_pool_market_snapshot.v1" })
  })
});

function exactOrigin(value, { httpsOnly = false } = {}) {
  const origin = value instanceof URL ? value : new URL(value);
  if (
    !new Set(httpsOnly ? ["https:"] : ["http:", "https:"]).has(origin.protocol) ||
    origin.username ||
    origin.password
  ) {
    throw new TypeError("Tenant OpenAPI origin is invalid");
  }
  return new URL(origin.origin);
}

function problemResponse(description) {
  return Object.freeze({
    description,
    content: Object.freeze({
      "application/problem+json": Object.freeze({
        schema: Object.freeze({ $ref: "#/components/schemas/ProblemDetails" })
      })
    })
  });
}

export function createTenantOpenApiDocument(publicOrigin) {
  const origin = exactOrigin(publicOrigin);
  return Object.freeze({
    openapi: "3.1.2",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: Object.freeze({
      title: "IPO.ONE Authenticated Tenant Protocol",
      version: "1.0.0",
      description: "One durable no-real-funds obligation protocol shared by Human and Agent entry modes."
    }),
    servers: Object.freeze([{ url: origin.origin }]),
    paths: Object.freeze({
      "/.well-known/ipo-one.json": Object.freeze({
        get: Object.freeze({
          operationId: "getDeployedChainCapability",
          summary: "Read exact-release hosted and chain-writing capability",
          security: Object.freeze([]),
          responses: Object.freeze({
            200: Object.freeze({
              description:
                "Exact deployed SHA and truthful current-user Evidence anchoring status",
              content: Object.freeze({
                "application/json": Object.freeze({
                  schema: CHAIN_CAPABILITY_DOCUMENT_SCHEMA
                })
              })
            }),
            421: problemResponse("Request did not arrive through the approved edge"),
            503: problemResponse("The exact deployment runtime is unavailable")
          })
        })
      }),
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
      }),
      "/tenant/v1/secured-pool/market": Object.freeze({
        get: Object.freeze({
          operationId: "readSecuredPoolMarket",
          summary: "Read exact public Pool market truth without private position data",
          security: Object.freeze([
            Object.freeze({ humanSession: [] }),
            Object.freeze({ workloadBearer: [], mutualTls: [] })
          ]),
          responses: Object.freeze({
            200: Object.freeze({
              description: "Read-only exact Pool market snapshot",
              content: Object.freeze({
                "application/json": Object.freeze({
                  schema: SECURED_POOL_MARKET_SNAPSHOT_SCHEMA
                })
              })
            }),
            401: problemResponse("Authentication required"),
            503: problemResponse("Pool market dependencies are unavailable")
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
    "x-ipo-one-profile": "public_authenticated_no_funds_beta",
    "x-ipo-one-wallet-operations": WALLET_EXECUTION_OPENAPI_OPERATION_IDS,
    "x-ipo-one-wallet-submission-enabled": false,
    "x-ipo-one-venue-operations": VENUE_EXECUTION_OPENAPI_OPERATION_IDS,
    "x-ipo-one-venue-delegate-activation-enabled": false,
    "x-ipo-one-venue-submission-enabled": false,
    "x-real-funds-enabled": false
  });
}

export function createAgentHttpsOpenApiDocument(publicOrigin) {
  const origin = exactOrigin(publicOrigin, { httpsOnly: true });
  const agentSecurity = Object.freeze([
    Object.freeze({ workloadBearer: [], mutualTls: [] })
  ]);
  const requestIdParameter = Object.freeze({
    name: "X-Request-ID",
    in: "header",
    required: true,
    schema: Object.freeze({
      type: "string",
      minLength: 8,
      maxLength: 128,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]+$"
    }),
    description: "Must equal the requestId inside the Tenant protocol envelope."
  });
  return Object.freeze({
    openapi: "3.1.2",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: Object.freeze({
      title: "IPO.ONE Remote Agent HTTPS Contract",
      version: "1.0.0",
      description:
        "Invite-only, sender-constrained HTTPS access to the durable no-real-funds Tenant protocol. Publishing this contract does not activate a remote endpoint."
    }),
    servers: Object.freeze([{ url: origin.origin }]),
    security: agentSecurity,
    paths: Object.freeze({
      "/.well-known/ipo-one.json": Object.freeze({
        get: Object.freeze({
          operationId: "getDeployedChainCapability",
          summary: "Read exact-release hosted and chain-writing capability",
          security: Object.freeze([]),
          responses: Object.freeze({
            200: Object.freeze({
              description:
                "Exact deployed SHA and truthful current-user Evidence anchoring status",
              content: Object.freeze({
                "application/json": Object.freeze({
                  schema: CHAIN_CAPABILITY_DOCUMENT_SCHEMA
                })
              })
            }),
            421: problemResponse("Request did not arrive through the approved edge"),
            503: problemResponse("The exact deployment runtime is unavailable")
          })
        })
      }),
      "/tenant/v1/operations": Object.freeze({
        post: Object.freeze({
          operationId: "executeAgentTenantOperation",
          summary: "Execute one authorized Agent Tenant operation",
          parameters: Object.freeze([requestIdParameter]),
          security: agentSecurity,
          requestBody: Object.freeze({
            required: true,
            content: Object.freeze({
              "application/json": Object.freeze({
                schema: tenantProtocolRequestSchema
              })
            })
          }),
          responses: Object.freeze({
            200: Object.freeze({
              description: "Validated Tenant protocol result for the same operation",
              headers: Object.freeze({
                "X-Request-ID": Object.freeze({
                  required: true,
                  schema: Object.freeze({ type: "string" })
                })
              }),
              content: Object.freeze({
                "application/json": Object.freeze({
                  schema: tenantProtocolResultSchema
                })
              })
            }),
            400: problemResponse("Request envelope or operation input rejected"),
            401: problemResponse("Workload authentication required or rejected"),
            403: problemResponse("Authenticated Agent lacks the required capability"),
            404: problemResponse("Resource is denied or unavailable"),
            409: problemResponse("Idempotency, replay, or state conflict"),
            413: problemResponse("Request exceeds the bounded body limit"),
            421: problemResponse("Request did not arrive through the approved edge"),
            429: problemResponse("Admission limit reached"),
            503: problemResponse("A required trusted dependency is unavailable")
          }),
          "x-ipo-one-idempotency": Object.freeze({
            mutationsRequireIdempotencyKey: true,
            replayUsesOriginalRequest: true,
            unknownOutcomeMustNotUseNewIdempotencyKey: true
          }),
          "x-ipo-one-timeout-outcome": "unknown_after_submission"
        })
      }),
      "/tenant/v1/catalog": Object.freeze({
        get: Object.freeze({
          operationId: "getAgentTenantOperationCatalog",
          summary: "Read the versioned closed Tenant operation catalog",
          parameters: Object.freeze([requestIdParameter]),
          security: agentSecurity,
          responses: Object.freeze({
            200: Object.freeze({
              description: "Versioned Tenant protocol catalog"
            }),
            401: problemResponse("Workload authentication required or rejected"),
            421: problemResponse("Request did not arrive through the approved edge"),
            503: problemResponse("A required trusted dependency is unavailable")
          })
        })
      }),
      "/tenant/v1/secured-pool/market": Object.freeze({
        get: Object.freeze({
          operationId: "readAgentSecuredPoolMarket",
          summary: "Read exact public Pool market truth without private position data",
          parameters: Object.freeze([requestIdParameter]),
          security: agentSecurity,
          responses: Object.freeze({
            200: Object.freeze({
              description: "Read-only exact Pool market snapshot",
              content: Object.freeze({
                "application/json": Object.freeze({
                  schema: SECURED_POOL_MARKET_SNAPSHOT_SCHEMA
                })
              })
            }),
            401: problemResponse("Workload authentication required or rejected"),
            421: problemResponse("Request did not arrive through the approved edge"),
            503: problemResponse("Pool market dependencies are unavailable")
          })
        })
      })
    }),
    components: Object.freeze({
      securitySchemes: Object.freeze({
        workloadBearer: Object.freeze({
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Issuer- and audience-bound access token with a maximum five-minute lifetime and an x5t#S256 confirmation claim."
        }),
        mutualTls: Object.freeze({
          type: "mutualTLS",
          description:
            "The trusted edge must bind the client certificate thumbprint to the access token and active internal Credential."
        })
      }),
      schemas: Object.freeze({
        ProblemDetails: PROBLEM_DETAILS_SCHEMA,
        ChainCapabilityDocument: CHAIN_CAPABILITY_DOCUMENT_SCHEMA,
        SecuredPoolMarketSnapshot: SECURED_POOL_MARKET_SNAPSHOT_SCHEMA
      })
    }),
    "x-ipo-one-schema-version": AGENT_HTTPS_OPENAPI_SCHEMA_VERSION,
    "x-ipo-one-profile": "public_authenticated_no_funds_beta",
    "x-ipo-one-wallet-operations": WALLET_EXECUTION_OPENAPI_OPERATION_IDS,
    "x-ipo-one-wallet-submission-enabled": false,
    "x-ipo-one-activation": "disabled_pending_named_deployment_approval",
    "x-ipo-one-safety": Object.freeze({
      remoteParticipantAccessEnabled: false,
      realFundsEnabled: false,
      humanCreditEnabled: false,
      testnetWritesEnabled: false,
      venueSignerEnabled: false,
      arbitraryWithdrawalEnabled: false
    })
  });
}
