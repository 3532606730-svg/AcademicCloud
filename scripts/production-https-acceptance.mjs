#!/usr/bin/env node
// production-https-acceptance.mjs
//
// Repository-owned real-behavior acceptance for the public HTTPS authentication
// contract. Mirrors frontend/src/api.ts request semantics exactly:
//   login:   POST /api/auth/login  Content-Type application/json + Accept + Origin + JSON body
//   session: GET  /api/auth/session Accept + session cookie
//   logout:  POST /api/auth/logout Accept + Origin + session cookie, NO Content-Type, NO body
//   revoked: GET  /api/auth/session with the same cookie (expect 401)
//
// The browser cookie jar is replaced by explicit Cookie/Set-Cookie handling,
// the only documented difference from the frontend client. Prints ONLY
// non-secret status codes and booleans; the password is read with output muted
// and never enters argv, history, files, logs, or chat.

import readline from "node:readline";

const BASE_URL = process.env.ACCEPTANCE_BASE_URL ?? "https://cloud.ajtlab.top";

function promptVisible(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let buffer = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.includes("\n")) {
          resolve(buffer.replace(/[\r\n]+$/, ""));
        }
      });
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (char) => {
      const code = char.charCodeAt(0);
      if (code === 3) {
        process.stdout.write("\n");
        stdin.setRawMode(false);
        process.exit(130);
      } else if (code === 13 || code === 10) {
        process.stdout.write("\n");
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        resolve(input);
      } else if (code === 8 || code === 127) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

function parseSetCookie(setCookie) {
  if (!setCookie) return null;
  const parts = setCookie.split(";").map((part) => part.trim());
  const flags = new Set(parts.slice(1).map((part) => part.toLowerCase()));
  return {
    nameValue: parts[0] ?? "",
    secure: flags.has("secure"),
    httpOnly: flags.has("httponly"),
    sameSiteStrict: flags.has("samesite=strict"),
    pathRoot: flags.has("path=/"),
    hasDomain: parts.slice(1).some((part) => part.toLowerCase().startsWith("domain=")),
    maxAgeZero: /(?:^|;\s*)max-age=0(?:;|$)/i.test(setCookie),
  };
}

function cookieValue(setCookie) {
  const parts = setCookie.split(";");
  return parts[0]?.trim() ?? "";
}

async function request(method, path, { cookie, json } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers.Origin = BASE_URL;
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    return fetch(`${BASE_URL}${path}`, { method, headers, body: JSON.stringify(json) });
  }
  return fetch(`${BASE_URL}${path}`, { method, headers });
}

async function main() {
  const loginName = await promptVisible("AcademicCloud login name: ");
  const password = await promptSecret("AcademicCloud password (hidden): ");

  const loginResponse = await request("POST", "/api/auth/login", { json: { loginName, password } });
  let loginBody = {};
  try {
    loginBody = await loginResponse.json();
  } catch {}

  const loginSetCookie = loginResponse.headers.get("set-cookie");
  const sessionCookie = loginSetCookie ? cookieValue(loginSetCookie) : "";
  const loginPolicy = loginSetCookie ? parseSetCookie(loginSetCookie) : null;
  const loginMatches = loginResponse.status === 200 && loginBody.account?.loginName === loginName;

  const sessionResponse = await request("GET", "/api/auth/session", { cookie: sessionCookie });
  let sessionBody = {};
  try {
    sessionBody = await sessionResponse.json();
  } catch {}
  const sessionMatches = sessionResponse.status === 200 && sessionBody.account?.loginName === loginName;

  const logoutResponse = await request("POST", "/api/auth/logout", { cookie: sessionCookie });
  const logoutPolicy = parseSetCookie(logoutResponse.headers.get("set-cookie"));

  const revokedResponse = await request("GET", "/api/auth/session", { cookie: sessionCookie });

  const verdict = loginResponse.status === 200 && loginMatches &&
    sessionResponse.status === 200 && sessionMatches &&
    logoutResponse.status === 204 && logoutPolicy?.maxAgeZero === true &&
    revokedResponse.status === 401;

  console.log(`login_status=${loginResponse.status}`);
  console.log(`login_loginName_matches=${loginMatches}`);
  console.log(`session_status=${sessionResponse.status}`);
  console.log(`session_loginName_matches=${sessionMatches}`);
  console.log(`logout_status=${logoutResponse.status}`);
  console.log(`logout_clearCookie_maxAge0=${logoutPolicy?.maxAgeZero ?? false}`);
  console.log(`revoked_session_status=${revokedResponse.status}`);
  console.log(`cookie_name_exact=${(loginPolicy?.nameValue.startsWith("__Host-ac_session=") ?? false) && !(loginPolicy?.nameValue.includes(";") ?? false)}`);
  console.log(`cookie_secure=${loginPolicy?.secure ?? false}`);
  console.log(`cookie_httpOnly=${loginPolicy?.httpOnly ?? false}`);
  console.log(`cookie_sameSiteStrict=${loginPolicy?.sameSiteStrict ?? false}`);
  console.log(`cookie_pathRoot=${loginPolicy?.pathRoot ?? false}`);
  console.log(`cookie_noDomain=${!(loginPolicy?.hasDomain ?? true)}`);
  console.log(`VERDICT=${verdict}`);
}

main().catch((error) => {
  console.error(`acceptance_error=${error.message}`);
  process.exitCode = 1;
});
