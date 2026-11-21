import type { ZodObject, ZodRawShape, ZodTypeAny } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { consentInput, exportInput, forgetInput } from "./routes/dpdp.ts"
import {
	extractInput,
	relationsInput,
	traverseInput,
	upsertInput,
} from "./routes/graph.ts"
import { commitInput, partialInput } from "./routes/ingest.ts"
import { deleteParams, saveInput } from "./routes/memories.ts"
import { activateInput, listQuery, registerInput } from "./routes/models.ts"
import { userIdQuery } from "./routes/profile.ts"
import { recallInput } from "./routes/recall.ts"

/**
 * OpenAPI 3.1 description of the API, generated from the SAME zod
 * schemas the routes validate with — request shapes can't drift from
 * the code. A test asserts every mounted route appears here.
 *
 * Any language can generate a client from it, e.g.
 *   npx @openapitools/openapi-generator-cli generate \
 *     -i http://localhost:8787/openapi.json -g go -o ./smaran-go
 */

type Json = Record<string, unknown>

const body = (schema: ZodTypeAny): Json => ({
	required: true,
	content: {
		"application/json": {
			schema: zodToJsonSchema(schema, {
				target: "openApi3",
				$refStrategy: "none",
			}),
		},
	},
})

function params(
	where: "query" | "path",
	schema: ZodObject<ZodRawShape>,
): Json[] {
	const shape = schema.shape
	return Object.entries(shape).map(([name, s]) => ({
		name,
		in: where,
		required: where === "path" || !(s as ZodTypeAny).isOptional(),
		schema: zodToJsonSchema(s as ZodTypeAny, {
			target: "openApi3",
			$refStrategy: "none",
		}),
	}))
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const ok = (description: string, schema?: Json): Json => ({
	description,
	...(schema ? { content: { "application/json": { schema } } } : {}),
})
const errors = {
	"400": { $ref: "#/components/responses/Invalid" },
	"401": { $ref: "#/components/responses/Unauthorized" },
	"429": { $ref: "#/components/responses/RateLimited" },
}
const open = { type: "object", additionalProperties: true }

function op(summary: string, extra: Json): Json {
	return {
		summary,
		security: [{ bearer: [] }],
		...extra,
		responses: { ...(extra.responses as Json), ...errors },
	}
}

const MEMORY = {
	type: "object",
	required: ["id", "text", "kind", "source", "createdAt", "metadata"],
	properties: {
		id: { type: "string" },
		tenantId: { type: "string" },
		userId: { type: ["string", "null"] },
		sessionId: { type: ["string", "null"] },
		text: { type: "string" },
		kind: { type: "string", enum: ["fact", "preference", "event", "entity"] },
		source: { type: "string", enum: ["text", "voice"] },
		metadata: open,
		createdAt: { type: "string", format: "date-time" },
		updatedAt: { type: "string", format: "date-time" },
		validFrom: { type: "string", format: "date-time" },
		validUntil: { type: ["string", "null"], format: "date-time" },
		supersedesId: {
			type: ["string", "null"],
			description: "Memory this one revises.",
		},
		confidenceAlpha: { type: "number" },
		confidenceBeta: {
			type: "number",
			description: "confidence = alpha / (alpha + beta)",
		},
		accessCount: { type: "integer" },
		lastAccessedAt: { type: ["string", "null"], format: "date-time" },
	},
}

const RECALL_RESULT = {
	type: "object",
	required: ["hits", "latencyMs"],
	properties: {
		hits: {
			type: "array",
			items: {
				type: "object",
				required: ["memory", "score", "tier"],
				properties: {
					memory: ref("Memory"),
					score: {
						type: "number",
						description: "For ordering only; not a calibrated probability.",
					},
					tier: { type: "string", enum: ["hot", "session", "cross"] },
					channels: open,
				},
			},
		},
		latencyMs: open,
		reranker: { type: "string" },
		rerankerSource: { type: "string" },
	},
}

export function buildOpenApi(opts: { persistent: boolean }): Json {
	const paths: Record<string, Json> = {
		"/v1/memories": {
			post: op("Save a memory", {
				description:
					"Cleans the text (self-correction, Hinglish normalization), skips pure confirmation questions, and stores it. A restatement corroborates the existing memory instead of duplicating it; a changed number/email/phone in the same sentence frame replaces it.",
				requestBody: body(saveInput),
				responses: {
					"200": ok("Stored (or corroborated) memories", {
						type: "object",
						properties: {
							memories: { type: "array", items: ref("Memory") },
							skipped: { type: "string", enum: ["question-or-tooshort"] },
						},
					}),
				},
			}),
		},
		"/v1/memories/{id}": {
			delete: op("Forget a memory", {
				parameters: params("path", deleteParams),
				responses: { "204": ok("Deleted (also when it did not exist)") },
			}),
		},
		"/v1/recall": {
			post: op("Recall relevant memories", {
				requestBody: body(recallInput),
				responses: {
					"200": ok("Ranked hits, best first", ref("RecallResult")),
				},
			}),
		},
		"/v1/ingest/partial": {
			post: op("Append a streaming (partial) transcript", {
				requestBody: body(partialInput),
				responses: { "200": ok("Buffered", open) },
			}),
		},
		"/v1/ingest/commit": {
			post: op("Commit the buffered turn as a memory", {
				requestBody: body(commitInput),
				responses: { "200": ok("Saved or skipped with a reason", open) },
			}),
		},
		"/v1/ingest/stats": {
			get: op("Streaming buffer stats", {
				responses: { "200": ok("Stats", open) },
			}),
		},
		"/v1/sessions/{id}/subscribe": {
			get: op("Subscribe to a session's memory events (Server-Sent Events)", {
				parameters: [
					{
						name: "id",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description:
							"text/event-stream of memory.saved / memory.forgotten events",
						content: { "text/event-stream": { schema: { type: "string" } } },
					},
				},
			}),
		},
	}

	if (opts.persistent) {
		Object.assign(paths, {
			"/v1/profile": {
				get: op("Get a user's consolidated profile", {
					parameters: params("query", userIdQuery),
					responses: {
						"200": ok("Profile", open),
						"404": { $ref: "#/components/responses/NotFound" },
					},
				}),
			},
			"/v1/profile/consolidate": {
				post: op("Recompute a user's profile from current memories", {
					parameters: params("query", userIdQuery),
					responses: { "200": ok("Result", open) },
				}),
			},
			"/v1/graph/entities": {
				post: op("Upsert entities", {
					requestBody: body(upsertInput),
					responses: { "200": ok("Entities", open) },
				}),
			},
			"/v1/graph/entities/extract": {
				post: op("Extract and store entities from text", {
					requestBody: body(extractInput),
					responses: { "200": ok("Entities", open) },
				}),
			},
			"/v1/graph/relations": {
				post: op("Add relations", {
					requestBody: body(relationsInput),
					responses: { "200": ok("Relations", open) },
				}),
			},
			"/v1/graph/traverse": {
				post: op("Multi-hop traversal from an entity", {
					requestBody: body(traverseInput),
					responses: { "200": ok("Visited entities and memories", open) },
				}),
			},
			"/v1/models": {
				get: op("List registered models", {
					parameters: params("query", listQuery),
					responses: { "200": ok("Models", open) },
				}),
				post: op("Register a model", {
					requestBody: body(registerInput),
					responses: { "200": ok("Model", open) },
				}),
			},
			"/v1/models/{id}/activate": {
				post: op("Activate a model for its role", {
					parameters: params("path", activateInput),
					responses: {
						"200": ok("Model", open),
						"404": { $ref: "#/components/responses/NotFound" },
					},
				}),
			},
			"/v1/dpdp/right-to-forget": {
				post: op("Erase all of a user's personal data", {
					requestBody: body(forgetInput),
					responses: { "200": ok("Erasure report", open) },
				}),
			},
			"/v1/dpdp/export": {
				get: op("Export all of a user's data", {
					parameters: params("query", exportInput),
					responses: { "200": ok("Export", open) },
				}),
			},
			"/v1/dpdp/consent": {
				post: op("Record a consent grant or withdrawal", {
					requestBody: body(consentInput),
					responses: { "200": ok("Stored consent record", open) },
				}),
			},
		})
	}

	const errorResponse = (description: string) => ({
		description,
		content: { "application/json": { schema: ref("Error") } },
	})

	return {
		openapi: "3.1.0",
		info: {
			title: "Smaran API",
			version: "0.1.0",
			description:
				"Voice-first memory for AI agents. Authenticate with `Authorization: Bearer <api key>`.",
		},
		servers: [{ url: "/" }],
		paths,
		components: {
			securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
			schemas: {
				Memory: MEMORY,
				RecallResult: RECALL_RESULT,
				Error: {
					type: "object",
					required: ["error"],
					properties: {
						error: {
							type: "object",
							required: ["code", "message", "requestId"],
							properties: {
								code: { type: "string" },
								message: { type: "string" },
								requestId: { type: "string" },
							},
						},
					},
				},
			},
			responses: {
				Invalid: errorResponse("Invalid request (code: invalid_request)"),
				Unauthorized: errorResponse("Missing or invalid API key"),
				NotFound: errorResponse("Not found"),
				RateLimited: errorResponse("Rate limit exceeded; see Retry-After"),
			},
		},
	}
}
