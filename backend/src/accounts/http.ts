import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { AuthorizationDeniedError, requireOwner } from "../auth/authorization.js";
import { PasswordKdfOverloadedError } from "../auth/password-hasher.js";
import {
  CredentialResetError,
  type CredentialResetService,
} from "../auth/credential-reset-service.js";
import {
  AccountAdministrationError,
  AccountAdministrationService,
  AccountConflictError,
  InvalidInvitationError,
  type SafeAccount,
  type SafeInvitation,
} from "./account-administration-service.js";

interface RegisterBody {
  inviteToken: string;
  loginName: string;
  password: string;
}

interface AccountStateBody {
  state: "active" | "disabled" | "archived";
}

interface AccountListQuery {
  includeArchived?: boolean;
}

interface IdParameters {
  id: string;
}

function accountDto(account: SafeAccount) {
  return {
    id: account.id,
    loginName: account.loginName,
    role: account.role,
    state: account.state,
    createdAt: account.createdAt.toISOString(),
  };
}

function invitationDto(invitation: SafeInvitation) {
  return {
    id: invitation.id,
    createdByAccountId: invitation.createdByAccountId,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    consumedAt: invitation.consumedAt?.toISOString() ?? null,
    consumedByAccountId: invitation.consumedByAccountId,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    status: invitation.status,
  };
}

function writeAudit(
  request: FastifyRequest,
  event: string,
  outcome: "succeeded" | "denied" | "busy",
  details: { actorAccountId?: string; targetAccountId?: string; reason?: string } = {},
) {
  const audit = { event, outcome, ...details };
  (outcome === "succeeded" ? request.log.info : request.log.warn).call(
    request.log,
    { audit },
    "account administration audit event",
  );
}

function requireOwnerRequest(request: FastifyRequest, reply: FastifyReply, onDenied?: () => void): boolean {
  try {
    requireOwner(request.authAccount);
    return true;
  } catch {
    onDenied?.();
    writeAudit(request, "accounts.owner_guard", "denied", { reason: "forbidden" });
    void reply.code(403).send({ error: "forbidden" });
    return false;
  }
}

function mapAdministrationError(error: unknown, reply: FastifyReply) {
  if (error instanceof AuthorizationDeniedError) return reply.code(403).send({ error: "forbidden" });
  if (error instanceof AccountAdministrationError) {
    if (error.code === "not_found") return reply.code(404).send({ error: "not_found" });
    return reply.code(409).send({ error: error.code });
  }
  throw error;
}

export interface AccountsHttpOptions {
  service: AccountAdministrationService;
  credentialResetService?: CredentialResetService;
  registrationRateLimitMax?: number;
}

export async function registerAccountsHttp(app: FastifyInstance, options: AccountsHttpOptions): Promise<void> {
  app.post<{ Body: RegisterBody }>(
    "/api/auth/register",
    {
      config: {
        rateLimit: {
          max: options.registrationRateLimitMax ?? 5,
          timeWindow: "1 minute",
          onExceeded: (request: FastifyRequest) => {
            options.service.recordRegistrationBusy("rate_limit_exceeded");
            writeAudit(request, "accounts.register", "denied", { reason: "rate_limit_exceeded" });
          },
        },
      },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["inviteToken", "loginName", "password"],
          properties: {
            inviteToken: { type: "string", minLength: 43, maxLength: 43, pattern: "^[A-Za-z0-9_-]+$" },
            loginName: { type: "string", minLength: 1, maxLength: 254, pattern: "^\\S+$" },
            password: { type: "string", minLength: 12, maxLength: 1024 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const account = await options.service.registerMember(
          request.body.inviteToken,
          request.body.loginName,
          request.body.password,
        );
        writeAudit(request, "accounts.register", "succeeded", { targetAccountId: account.id });
        return reply.code(201).send({ account: accountDto(account) });
      } catch (error: unknown) {
        if (error instanceof InvalidInvitationError) {
          writeAudit(request, "accounts.register", "denied", { reason: "invalid_invitation" });
          return reply.code(400).send({ error: "invalid_invitation" });
        }
        if (error instanceof AccountConflictError) {
          writeAudit(request, "accounts.register", "denied", { reason: "login_unavailable" });
          return reply.code(409).send({ error: "login_unavailable" });
        }
        if (error instanceof PasswordKdfOverloadedError) {
          options.service.recordRegistrationBusy("kdf_overloaded");
          writeAudit(request, "accounts.register", "busy", { reason: "kdf_overloaded" });
          return reply.header("retry-after", "1").code(429).send({ error: "authentication_busy" });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/accounts/invitations",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply, () => options.service.recordAuditAttempt(
        request.authAccount!, "accounts.invitation_create", new AuthorizationDeniedError(),
      ))) return;
      try {
        const created = options.service.createInvitation(request.authAccount!);
        writeAudit(request, "accounts.invitation_create", "succeeded", { actorAccountId: request.authAccount!.id });
        return reply.code(201).send({
          invitation: invitationDto(created.invitation),
          rawToken: created.rawToken,
        });
      } catch (error: unknown) {
        options.service.recordAuditAttempt(request.authAccount!, "accounts.invitation_create", error);
        return mapAdministrationError(error, reply);
      }
    },
  );

  app.get(
    "/api/accounts/invitations",
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply)) return;
      try {
        return { invitations: options.service.listInvitations(request.authAccount!).map(invitationDto) };
      } catch (error: unknown) {
        return mapAdministrationError(error, reply);
      }
    },
  );

  app.delete<{ Params: IdParameters }>(
    "/api/accounts/invitations/:id",
    {
      preHandler: app.authenticate,
      schema: { params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1, maxLength: 128 } } } },
    },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply, () => options.service.recordAuditAttempt(
        request.authAccount!, "accounts.invitation_revoke", new AuthorizationDeniedError(),
      ))) return;
      try {
        const invitation = options.service.revokeInvitation(request.authAccount!, request.params.id);
        writeAudit(request, "accounts.invitation_revoke", "succeeded", { actorAccountId: request.authAccount!.id });
        return { invitation: invitationDto(invitation) };
      } catch (error: unknown) {
        options.service.recordAuditAttempt(request.authAccount!, "accounts.invitation_revoke", error);
        return mapAdministrationError(error, reply);
      }
    },
  );

  app.get<{ Querystring: AccountListQuery }>(
    "/api/accounts",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { includeArchived: { type: "boolean", default: false } },
        },
      },
    },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply)) return;
      try {
        return { accounts: options.service.listAccounts(request.authAccount!, request.query.includeArchived).map(accountDto) };
      } catch (error: unknown) {
        return mapAdministrationError(error, reply);
      }
    },
  );

  app.patch<{ Params: IdParameters; Body: AccountStateBody }>(
    "/api/accounts/:id/state",
    {
      preHandler: app.authenticate,
      schema: {
        params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1, maxLength: 128 } } },
        body: { type: "object", additionalProperties: false, required: ["state"], properties: { state: { type: "string", enum: ["active", "disabled", "archived"] } } },
      },
    },
    async (request, reply) => {
      if (!requireOwnerRequest(request, reply, () => options.service.recordAuditAttempt(
        request.authAccount!, "accounts.member_state_change", new AuthorizationDeniedError(),
      ))) return;
      try {
        const account = options.service.setMemberState(request.authAccount!, request.params.id, request.body.state);
        writeAudit(request, "accounts.member_state", "succeeded", {
          actorAccountId: request.authAccount!.id,
          targetAccountId: account.id,
        });
        return { account: accountDto(account) };
      } catch (error: unknown) {
        options.service.recordAuditAttempt(request.authAccount!, "accounts.member_state_change", error);
        return mapAdministrationError(error, reply);
      }
    },
  );

  if (options.credentialResetService) {
    app.post<{ Params: IdParameters }>(
      "/api/accounts/:id/credential-reset",
      {
        preHandler: app.authenticate,
        schema: {
          params: {
            type: "object",
            additionalProperties: false,
            required: ["id"],
            properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
          },
        },
      },
      async (request, reply) => {
        if (!requireOwnerRequest(request, reply, () => options.credentialResetService!.recordIssueAttempt(
          request.authAccount!, new AuthorizationDeniedError(),
        ))) return;
        try {
          const created = options.credentialResetService!.issue(request.authAccount!, request.params.id);
          writeAudit(request, "accounts.credential_reset_issue", "succeeded", {
            actorAccountId: request.authAccount!.id,
            targetAccountId: request.params.id,
          });
          return reply.code(201).send({
            reset: {
              id: created.reset.id,
              accountId: created.reset.accountId,
              createdAt: created.reset.createdAt.toISOString(),
              expiresAt: created.reset.expiresAt.toISOString(),
            },
            rawToken: created.rawToken,
          });
        } catch (error: unknown) {
          options.credentialResetService!.recordIssueAttempt(request.authAccount!, error);
          if (error instanceof CredentialResetError) {
            if (error.code === "not_found") return reply.code(404).send({ error: "not_found" });
            return reply.code(409).send({ error: error.code });
          }
          throw error;
        }
      },
    );
  }
}
