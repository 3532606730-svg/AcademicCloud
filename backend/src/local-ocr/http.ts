import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LOCAL_OCR_ROOT as ROOT, LOCAL_OCR_LIMITS as LIMIT, type LocalOcrBookQuery, type LocalOcrCompletion, type LocalOcrRequestInput } from '@academiccloud/compute-contracts';
import { LocalOcrError } from './model.js';
import type { LocalOcrService } from './service.js';

const id = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' } as const;
const params = { type: 'object', additionalProperties: false, required: ['id'], properties: { id } } as const;
const empty = { type: 'object', additionalProperties: false, properties: {} } as const;
const physicalPage = { type: 'integer', minimum: 1, maximum: 1_000_000 } as const;
const bookQuery = { type: 'object', additionalProperties: false, required: ['resourceId', 'sourceId', 'pageCount'],
  properties: { resourceId: id, sourceId: id, pageCount: { type: 'integer', minimum: 1, maximum: LIMIT.maxResultsPerAccount } } } as const;
const maxBase64 = Math.ceil(LIMIT.maxImageBytes / 3) * 4;
const rate = (max: number) => ({ rateLimit: { max, timeWindow: '1 minute' } });
const token = (request: FastifyRequest): string => {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/u.test(value)) throw new LocalOcrError('device_authentication_required');
  return value.slice(7);
};
function account(request: FastifyRequest): string {
  if (!request.authAccount) throw new Error('local OCR requires authentication');
  return request.authAccount.id;
}
function respond(reply: FastifyReply, work: () => unknown) {
  try { return work(); } catch (error) {
    if (!(error instanceof LocalOcrError)) throw error;
    const code = error.code;
    const status = code === 'not_found' ? 404 : code === 'invalid_request' ? 400
      : code === 'pairing_invalid' || code === 'device_authentication_required' ? 401
      : code === 'device_offline' ? 503 : code === 'limit_exceeded' ? 429 : 409;
    return reply.code(status).send({ error: code });
  }
}
async function requireJson(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') await reply.code(415).send({ error: 'unsupported_media_type' });
}
export async function registerLocalOcrHttp(app: FastifyInstance, service: LocalOcrService): Promise<void> {
  app.get(`${ROOT}/devices`, { preHandler: app.authenticate, schema: { querystring: empty } }, (request, reply) =>
    respond(reply, () => ({ devices: service.devices(account(request)) })));
  app.post<{ Body: { label: string } }>(`${ROOT}/pairing`, { preHandler: app.authenticate, preValidation: requireJson, config: rate(10),
    schema: { body: { type: 'object', additionalProperties: false, required: ['label'], properties: { label: { type: 'string', minLength: 1, maxLength: 80 } } } } },
    (request, reply) => respond(reply, () => service.pairing(account(request), request.body.label)));
  app.post<{ Body: { pairingCode: string; capabilities: unknown; probeResult: unknown } }>(`${ROOT}/connect`, {
    preValidation: requireJson, config: rate(10), bodyLimit: 200_000,
    schema: { querystring: empty, body: { type: 'object', additionalProperties: false, required: ['pairingCode', 'capabilities', 'probeResult'], properties: {
      pairingCode: { type: 'string', maxLength: 128 }, capabilities: { type: 'object' }, probeResult: { type: 'object' },
    } } },
  }, (request, reply) => respond(reply, () => service.connect(request.body)));
  app.post<{ Params: { id: string } }>(`${ROOT}/devices/:id/revoke`, { preHandler: app.authenticate, preValidation: requireJson,
    schema: { params, body: empty } }, (request, reply) => respond(reply, () => ({ device: service.revoke(account(request), request.params.id) })));
  app.post<{ Body: LocalOcrRequestInput }>(`${ROOT}/requests`, {
    preHandler: app.authenticate, preValidation: requireJson, bodyLimit: maxBase64 + 4096, config: rate(20),
    schema: { body: { type: 'object', additionalProperties: false,
      required: ['clientRequestId', 'deviceId', 'resourceId', 'sourceId', 'physicalPage', 'imageBase64', 'imageWidth', 'imageHeight', 'rotation'], properties: {
        clientRequestId: id, deviceId: id, resourceId: id, sourceId: id, physicalPage,
        imageBase64: { type: 'string', minLength: 44, maxLength: maxBase64 },
        imageWidth: { type: 'integer', minimum: 1, maximum: LIMIT.maxWidth }, imageHeight: { type: 'integer', minimum: 1, maximum: LIMIT.maxHeight },
        rotation: { enum: [0, 90, 180, 270] },
      } } },
  }, (request, reply) => respond(reply, () => ({ job: service.createRequest(account(request), request.body) })));
  app.get<{ Params: { id: string } }>(`${ROOT}/requests/:id`, { preHandler: app.authenticate, schema: { params, querystring: empty } },
    (request, reply) => respond(reply, () => ({ job: service.status(account(request), request.params.id) })));
  app.post<{ Params: { id: string } }>(`${ROOT}/requests/:id/cancel`, { preHandler: app.authenticate, preValidation: requireJson, schema: { params, body: empty } },
    (request, reply) => respond(reply, () => ({ job: service.cancel(account(request), request.params.id) })));
  app.get<{ Querystring: LocalOcrBookQuery }>(`${ROOT}/book-progress`, { preHandler: app.authenticate, schema: { querystring: bookQuery } },
    (request, reply) => respond(reply, () => {
      const progress = service.bookProgress(account(request), request.query);
      reply.header('cache-control', 'private, no-store');
      return progress;
    }));
  app.get<{ Querystring: LocalOcrBookQuery & { format: 'txt' | 'jsonl' } }>(`${ROOT}/book-export`, {
    preHandler: app.authenticate, config: rate(10), schema: { querystring: { ...bookQuery,
      required: [...bookQuery.required, 'format'], properties: { ...bookQuery.properties, format: { enum: ['txt', 'jsonl'] } } } },
  }, (request, reply) => respond(reply, () => {
    const { format, ...query } = request.query;
    const lines = service.bookExport(account(request), query, format);
    reply.header('content-type', format === 'txt' ? 'text/plain; charset=utf-8' : 'application/x-ndjson; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="academiccloud-private-ocr-book.${format}"`);
    reply.header('cache-control', 'private, no-store');
    return reply.send(Readable.from(lines, { objectMode: false, highWaterMark: 64 * 1024 }));
  }));
  app.get<{ Querystring: { resourceId: string; sourceId: string; physicalPage: number } }>(`${ROOT}/results`, { preHandler: app.authenticate,
    schema: { querystring: { type: 'object', additionalProperties: false, required: ['resourceId', 'sourceId', 'physicalPage'], properties: { resourceId: id, sourceId: id, physicalPage } } } },
    (request, reply) => respond(reply, () => ({ items: service.results(account(request), request.query) })));
  app.get<{ Params: { id: string } }>(`${ROOT}/results/:id`, { preHandler: app.authenticate, schema: { params, querystring: empty } },
    (request, reply) => respond(reply, () => ({ result: service.result(account(request), request.params.id) })));
  app.patch<{ Params: { id: string }; Body: { revision: number; correctedText: string } }>(`${ROOT}/results/:id`, {
    preHandler: app.authenticate, preValidation: requireJson, bodyLimit: 100_000, schema: { params, body: { type: 'object', additionalProperties: false,
      required: ['revision', 'correctedText'], properties: { revision: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER - 1 }, correctedText: { type: 'string', maxLength: 16000 } } } },
  }, (request, reply) => respond(reply, () => ({ result: service.correct(account(request), request.params.id, request.body) })));
  app.get(`${ROOT}/device/claim`, { config: rate(120), schema: { querystring: empty } },
    (request, reply) => respond(reply, () => ({ job: service.claim(token(request)) })));
  app.post<{ Body: { jobId: string; attemptId: string } }>(`${ROOT}/device/heartbeat`, { preValidation: requireJson, config: rate(120),
    schema: { querystring: empty, body: { type: 'object', additionalProperties: false, required: ['jobId', 'attemptId'], properties: { jobId: id, attemptId: id } } } },
    (request, reply) => respond(reply, () => service.heartbeat(token(request), request.body)));
  app.post<{ Body: LocalOcrCompletion }>(`${ROOT}/device/complete`, { preValidation: requireJson, config: rate(30), bodyLimit: 200_000,
    schema: { querystring: empty, body: { type: 'object', additionalProperties: false, required: ['jobId', 'attemptId'], properties: {
      jobId: id, attemptId: id, result: { type: 'object' }, errorCode: { enum: ['engine_busy', 'engine_failed', 'invalid_result'] },
    }, oneOf: [{ required: ['result'], not: { required: ['errorCode'] } }, { required: ['errorCode'], not: { required: ['result'] } }] } },
  }, (request, reply) => respond(reply, () => service.complete(token(request), request.body)));
  const sweep = setInterval(() => { try { service.sweep(); } catch { /* Per-request checks remain authoritative. */ } }, 15_000);
  sweep.unref();
  app.addHook('onClose', () => { clearInterval(sweep); service.close(); });
}
