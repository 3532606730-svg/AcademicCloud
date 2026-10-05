# Paired local current-page OCR — October 1 verification

Scope: ADR-049 implementation `5fb19382c1c614d2070afa3504c655e76ae456ce` on `codex/vnext-remediation-20260906`, based on documentation baseline `50121e91298737bfc50aa04982cc7df099beb0b3`. Implementation is published; fresh fetch verified clean active local/remote equality. This following documentation-only checkpoint records that publication. The evidence is repository/local verification, not production activation or final vNext acceptance.

## Implemented behavior

The signed-in account creates a one-use pairing code for its own outbound connector. The Reader captures the currently painted physical page within the existing PNG/frame budget. Core rechecks account, Library and source generation on each operation. Successful machine text, rectangles and frame provenance are private and immutable; a separate correction uses revision CAS. No member or Owner exception exposes another account's device or text. Images remain transient and bounded. Online connection is an information-only tab; no cloud credential or billing path is activated.

The downloadable connector contains the CLI, three required Python helpers, configuration/tutorial and file hashes. Engine/model installation is separate. The native wrapper checks pinned package/model identities and denies native network activity before imports. On the Owner's shared machine, the connector requires exact cooperating Local Pull/Bridge markers and live process registrations. Idle polls release the native lease; native cleanup precedes an explicit release. Abnormal helper/parent loss leaves a durable busy marker and subsequent acquisitions fail closed. The deployment templates use the existing `academiccloud` user and a private writable coordination directory. Production's older Compute release cannot satisfy this contract.

## Checks performed

| Area | Actual result |
|---|---|
| Private backend routes, authority and lifecycle | 14/14 PASS; actual HTTP/Auth/SQLite tests, separate log-redaction check PASS |
| Affected migrations and production startup | 37/37 PASS across the changed latest-schema fixtures, migration040 and startup checks |
| Compiled application and compatible rollback | Current schema40 compiled acceptance PASS; exact older50121e9 Core with complete001–040 directory starts, retains machine/correction rows and passes integrity/FK checks; old local OCR namespace remains404 |
| Frontend API/controller/frame/Reader/UI | Final seven related files67/67 PASS; separate App/research/source targeted10 PASS with151 deliberately excluded; frontend typecheck/build PASS |
| Connector, pairing input, worker and Bridge | 39/39 related TypeScript tests PASS; Compute typecheck/build PASS |
| Existing extracted-PNG/online adapter boundary | 31/31 PASS; no new provider call |
| Offline Python member wrapper | Three version/network-boundary mocks PASS; installed WSL wrapper self-check PASS without model inference |
| Real Linux native lease/process behavior | 9/9 PASS as the existing `academiccloud` user, including mutual exclusion, abort, parent/helper loss, group signals and exact live-registration contracts |
| Deployment templates | 13/13 route-body/configuration/artifact tests PASS; affected assembly/verification shell syntax checked separately |

These are scoped runs with overlapping coverage, not a full-suite total. Root reviewed the slice and repaired material findings: nginx's16KiB default rejection of frames/results, an unwritable lock path under systemd, idle long-poll lock ownership, premature loss/release of the native holder, and a connector pairing-input abort hang. Backend/frontend/Compute implementation used GPT-6.1 Sol/xhigh subagents. The initial independent follow-up reviewers exhausted usage; October5 resumed backend and Reader reviews returned bounded PASS, while native review found the sidecar closure defect described below and independently approved its repair. The earlier internal online adapter's independent review remains its own historical evidence.

## Actual signed-in local browser path

Codex in-app browser used the built frontend and actual Core application/Auth/SQLite40 at loopback. A two-page synthetic PDF was admitted to a synthetic Library, with separate synthetic Owner and Member accounts. A synthetic engine returned explicitly labelled fixture text through the real connector protocol; no inference accuracy is claimed.

1. Owner login → Library PDF → add to My Research → painted Reader → pairing → current-page OCR saved a private result.
2. Machine text remained separate from an edited correction. Save/reload restored both private history and correction.
3. Page1 frame was1978×2800, SHA-256 `92961336397c1e2faacaf56dabeea63f1f670d165475d444bf1ac5cf3b34273d`.
4. A slow page2 request used1978×2800, SHA-256 `72de8891826e92245f1594132142d12708cabd0c9534abfba32478406e0415a7`. Switching back cancelled it: two accepted heartbeats then409, with no completion. Page1's correction stayed intact.
5. Revoking the first device stopped its connector with access revoked. Member login to the same shared PDF showed no Owner device, history, machine text or correction. Member's current-page action opened its own connection dialog.
6. Desktop1440 and mobile390 document widths matched their viewports. The mobile dialog stayed within12–378.4px. Escape returned focus to `连接OCR`.
7. Final tutorial included official Node24/Paddle links, pinned-version requirements, standard-install detection, other-install configuration, pairing and failure guidance. The real download succeeded and its bytes match the committed public ZIP.

Ignored local raw evidence remains under `output/vnext/member-local-ocr-browser/`, including device audit, fixture database and screenshots `mobile-dialog-final-top.png` and `mobile-dialog-final.png`. Synthetic credentials/pairing material and raw logs are excluded from Git. These screenshots depict a local fixture, not the deployed website.

## Final connector identity

- Public file: `frontend/public/local-ocr-connector.zip`
- Size:86,228 bytes
- SHA-256:`ed80700bfd402bb742dec87d15f6b2c44a2c078247cabc88bd15b254735c405a`
- Eight allowlisted entries; all seven payload files match the included hash manifest. No model weights, credentials, bootstrap token or document pages.
- Unpacked JavaScript syntax PASS. The CLI with no configuration exits with controlled `configuration_invalid`; no unresolved dynamic-require failure.
- October5 browser-downloaded final ZIP and rebuilt frontend/dist copy have the same SHA-256. The earlier October1 ZIP1b57c8e… is superseded.

## October5 final publication review

October5 final-review continuation: independent GPT-6.1 Sol/xhigh backend and Reader reviews returned bounded PASS. Native review reproduced and repaired a P1 close-ordering defect in the inherited Paddle sidecar adapter: abort previously cleared its child reference after sending SIGKILL, allowing a subsequent `close()` to return before actual native closure. The narrow TypeScript repair retains the child until Node's close acknowledgement, shares concurrent cleanup, waits before restart and isolates old-child events. Four new meaningful regressions cover abort, timeout, invalid output and restart isolation; Paddle8+Member15=23/23 passed, final Paddle8/8 and Compute types/build passed. A separate independent lifecycle reviewer returned bounded PASS; root inspected the final stderr identity guard. Python sidecar/model/parser/provenance stayed unchanged. Connector regeneration, syntax/manifest checks and the actual browser download now cover the final bytes above. Latest local screenshot is `output/vnext/member-local-ocr-browser/desktop-final-20261005.png`.

The independent whole-diff reviewer also reproduced the same premature native-release boundary in the inherited llama-server reasoner. The narrow lifecycle repair retains a retiring child until Node's close acknowledgement, coalesces cleanup, waits before replacement and handles spawn error without an exit event. Ten new lifecycle regressions plus40 existing bibliographic checks pass50/50; Compute types/build pass. A separate verifier independently reviewed the repair and returned bounded PASS. Model configuration, launch arguments, adapter/prompt/parser, evidence and authority semantics are unchanged.

The first whole-project pass exposed two obsolete backup schema39 assertions, now updated to the actual complete schema40 fixture. Frontend review corrected a lazy-reader test that captured the temporary iframe and a CSP test that confused trusted CSSOM property writes with textual style injection. The revised checks retain reader identity/signing assertions and verify the two numeric measured dock heights while forbidding style-attribute and cssText writes. Both targeted frontend cases pass; no layout or CSP configuration changed.

Fresh dependency auditing found existing Fastify, fast-uri and ip-address production advisories, plus an undici development-chain advisory. Bounded compatible updates change only five existing lock entries: Fastify5.12.5, fast-uri3.1.8/4.2.1, ip-address10.7.3 and dev-only undici8.11.2. No package was added or removed and no major version changed. Production and complete dependency audits both report zero advisories; independent lock-diff review returned bounded PASS.

The connector was rebuilt after the reasoner and dependency repairs and remains byte-identical to the final browser-downloaded ZIP above. Real Linux native tests9/9 and Python mocks3/3 were rechecked on October5 without engine inference or production mutation. Actual local Windows and WSL Node is24.16.0; Windows npm is11.13.0, versus repository packageManager11.19.1. Node satisfies the declared24 range; these local checks are not an exact production-runtime release qualification.

The final whole-project publication gate passes: complete root test:ci exits0 with backend535pass/3Windows-symlink skips, frontend490/490 across35files, contracts14/14, Compute260pass/1Windows-symlink skip and operations86/86. Total1385pass/1389tests, zero failures. All workspace typecheck/build and schema40 compiled acceptance exit0. Compiled acceptance confirms restart persistence, Owner non-disclosure, isolated synthetic restore and repeat initialization with zero migrations/admissions. The final App file's two target cases were separately rechecked after its nullable CSSOM type guard; final typecheck/build cover that same file. Native, dependency and App repairs have independent bounded PASS reviews. Raw logs and intermediate failures are preserved under ignored `output/vnext/prepublication-20261005/`; final results use `final-stable-*` and `npm-audit-*-final.json`.

## Remaining acceptance

Production was not changed or freshly re-probed in this slice. Recorded Core/frontend57b8723 remains schema39; Compute7e2d1bf and Bridgeba0a74f remain the previous observed runtimes. Schema040 and the guard-aware exact releases must be qualified and installed together within the coordinated release gate, with nginx syntax validation, same-user directory/config provisioning and forced-loss/recovery evidence. Then the normal signed-in Owner website must pair the real installed engine and recognize actual bounded Reader pages. The earlier eight-page native measurement used oversized3300px frames and cannot substitute for that acceptance.

Online member credentials/cost/disclosure, whole-book processing, persistent per-book/page/ZIP recovery, adjudicated bibliographic quality, current-corpus reconciliation and whole-product/final-report gates remain separate. No main merge, paid activation, new cloud source disclosure or whole-book/corpus OCR follows from this checkpoint.
