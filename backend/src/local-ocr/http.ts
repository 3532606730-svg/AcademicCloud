import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LOCAL_OCR_ROOT as ROOT, LOCAL_OCR_LIMITS as LIMIT, type LocalOcrBookQuery, type LocalOcrCompletion, type LocalOcrRequestInput } from '@academiccloud/compute-contracts';
import type { LocalOcrBookStartInput, LocalOcrBookAttemptInput, LocalOcrBookHeartbeatInput, LocalOcrBookPageInput, LocalOcrBookFinishInput } from '@academiccloud/compute-contracts';
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
async function respond(reply: FastifyReply, work: () => unknown) {
  try { return await work(); } catch (error) {
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
  app.post<{ Body: { pairingCode: string; capabilities: unknown; probeResult: unknown; transportFeatures?: unknown } }>(`${ROOT}/connect`, {
    preValidation: requireJson, config: rate(10), bodyLimit: 200_000,
    schema: { querystring: empty, body: { type: 'object', additionalProperties: false, required: ['pairingCode', 'capabilities', 'probeResult'], properties: {
      pairingCode: { type: 'string', maxLength: 128 }, capabilities: { type: 'object' }, probeResult: { type: 'object' },
      transportFeatures: { type: 'array', maxItems: 1, uniqueItems: true, items: { enum: ['pdf_book_v1'] } },
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
  const attempt = { type:'object', additionalProperties:false, required:['bookId','attemptId'], properties:{bookId:id,attemptId:id} } as const;
  const pageCount = {type:'integer',minimum:1,maximum:500} as const;
  app.get<{ Querystring: {resourceId?:string;sourceId?:string} }>(`${ROOT}/books`, {preHandler:app.authenticate,
    schema:{querystring:{type:'object',additionalProperties:false,properties:{resourceId:id,sourceId:id}}}}, (request,reply) =>
    respond(reply,() => {reply.header('cache-control','private, no-store');return {jobs:service.books(account(request),request.query)};}));
  app.post<{ Body:LocalOcrBookStartInput }>(`${ROOT}/books`, {preHandler:app.authenticate,preValidation:requireJson,config:rate(10),
    schema:{querystring:empty,body:{type:'object',additionalProperties:false,required:['clientRequestId','deviceId','resourceId','sourceId','pageCount'],
      properties:{clientRequestId:id,deviceId:id,resourceId:id,sourceId:id,pageCount}}}}, (request,reply) => respond(reply,() => ({job:service.startBook(account(request),request.body)})));
  app.get<{ Params:{id:string} }>(`${ROOT}/books/:id`,{preHandler:app.authenticate,schema:{params,querystring:empty}}, (request,reply) =>
    respond(reply,() => {reply.header('cache-control','private, no-store');return {job:service.book(account(request),request.params.id)};}));
  for (const action of ['pause','cancel'] as const) app.post<{Params:{id:string}}>(`${ROOT}/books/:id/${action}`,
    {preHandler:app.authenticate,preValidation:requireJson,schema:{params,querystring:empty,body:empty}}, (request,reply) =>
      respond(reply,() => ({job:service.controlBook(account(request),request.params.id,action)})));
  app.post<{Params:{id:string};Body:{deviceId:string}}>(`${ROOT}/books/:id/resume`,{preHandler:app.authenticate,preValidation:requireJson,
    schema:{params,querystring:empty,body:{type:'object',additionalProperties:false,required:['deviceId'],properties:{deviceId:id}}}}, (request,reply) =>
      respond(reply,() => ({job:service.controlBook(account(request),request.params.id,'resume',request.body.deviceId)})));
  app.get(`${ROOT}/device/book-claim`,{config:rate(120),schema:{querystring:empty}}, (request,reply) => respond(reply,() => ({job:service.claimBook(token(request))})));
  app.post<{Body:LocalOcrBookHeartbeatInput}>(`${ROOT}/device/book-heartbeat`,{preValidation:requireJson,config:rate(120),schema:{querystring:empty,
    body:{...attempt,properties:{...attempt.properties,pageCount}}}}, (request,reply) => respond(reply,() => service.heartbeatBook(token(request),request.body)));
  app.post<{Body:LocalOcrBookAttemptInput}>(`${ROOT}/device/book-source`,{preValidation:requireJson,config:rate(20),schema:{querystring:empty,body:attempt}},
    (request,reply) => respond(reply,() => {reply.header('cache-control','private, no-store');return service.sourceBook(token(request),request.body);}));
  app.post<{Body:LocalOcrBookPageInput}>(`${ROOT}/device/book-page`,{preValidation:requireJson,config:rate(60),bodyLimit:maxBase64+204_096,
    schema:{querystring:empty,body:{...attempt,required:[...attempt.required,'physicalPage','imageBase64','imageWidth','imageHeight','rotation','result'],
      properties:{...attempt.properties,physicalPage:pageCount,imageBase64:{type:'string',minLength:44,maxLength:maxBase64},
        imageWidth:{type:'integer',minimum:1,maximum:LIMIT.maxWidth},imageHeight:{type:'integer',minimum:1,maximum:LIMIT.maxHeight},rotation:{enum:[0,90,180,270]},result:{type:'object'}}}}},
    (request,reply) => respond(reply,() => service.pageBook(token(request),request.body)));
  app.post<{Body:LocalOcrBookFinishInput}>(`${ROOT}/device/book-finish`,{preValidation:requireJson,config:rate(20),schema:{querystring:empty,
    body:{...attempt,properties:{...attempt.properties,pageCount,errorCode:{enum:['engine_busy','engine_failed','invalid_result']},failedPhysicalPage:pageCount},
      oneOf:[{required:['pageCount'],not:{anyOf:[{required:['errorCode']},{required:['failedPhysicalPage']}]}},{required:['errorCode'],not:{required:['pageCount']}}]}}},
    (request,reply) => respond(reply,() => ({job:service.finishBook(token(request),request.body)})));
  const sweep = setInterval(() => { try { service.sweep(); } catch { /* Per-request checks remain authoritative. */ } }, 15_000);
  sweep.unref();
  app.addHook('onClose', () => { clearInterval(sweep); service.close(); });
}
