/// <reference types="node" />
// Structural evidence for the mobile presentation. jsdom cannot measure real
// viewport layout, so the guarantees live where they are implemented: the
// shared stylesheet. Every assertion below is scoped to the primary mobile
// media block (`@media (max-width: 48rem)`) and to the intended SELECTOR —
// bare substring checks can be satisfied by unrelated rules and prove
// nothing. Component structure is asserted in App.test.tsx.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Vitest runs from the frontend workspace root.
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const MOBILE_BLOCK_START = "@media (max-width: 48rem) {";
const NEXT_BLOCK_START = "@media (prefers-reduced-motion";

// The text of the primary mobile media block only (from its opening marker to
// the next top-level at-rule).
function mobileBlock(): string {
  const start = styles.indexOf(MOBILE_BLOCK_START);
  const end = styles.indexOf(NEXT_BLOCK_START, start);
  if (start === -1 || end === -1) throw new Error("mobile media block not found");
  return styles.slice(start, end);
}

// A declaration inside a specific selector's rule block within `block`.
function ruleHas(block: string, selector: string, declaration: RegExp): boolean {
  const selectorIndex = block.indexOf(selector);
  if (selectorIndex === -1) return false;
  const openBrace = block.indexOf("{", selectorIndex);
  const closeBrace = block.indexOf("}", openBrace);
  if (openBrace === -1 || closeBrace === -1) return false;
  return declaration.test(block.slice(openBrace, closeBrace));
}

describe("mobile presentation stylesheet", () => {
  it("turns the sidebar itself into a fixed safe-area bottom navigation with four equal destinations", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".sidebar {", /position:\s*fixed/)).toBe(true);
    expect(ruleHas(block, ".sidebar {", /calc\(0\.35rem \+ env\(safe-area-inset-bottom\)\)/)).toBe(true);
    expect(ruleHas(block, ".sidebar nav {", /repeat\(4,\s*minmax\(0,\s*1fr\)\)/)).toBe(true);
    // The workspace must clear the fixed navigation.
    expect(ruleHas(block, ".workspace {", /calc\(7\.5rem \+ env\(safe-area-inset-bottom\)\)/)).toBe(true);
  });

  it("makes the mobile preview a fullscreen dynamic-viewport reader with a vh fallback in the right order", () => {
    const block = mobileBlock();
    const previewRule = /\.preview-modal\s*\{([^}]*)\}/.exec(block)?.[1] ?? "";
    expect(previewRule).toContain("height: 100vh");
    expect(previewRule).toContain("height: 100dvh");
    expect(previewRule.indexOf("height: 100vh")).toBeLessThan(previewRule.indexOf("height: 100dvh"));
    expect(previewRule).toContain("border-radius: 0");
    expect(previewRule).toContain("margin: 0");
    expect(ruleHas(block, ".preview-modal > header {", /env\(safe-area-inset-top\)/)).toBe(true);
  });

  it("defines the mobile catalogue metadata line and shows it only in the mobile block", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".entry-mobile-meta {", /display:\s*block/)).toBe(true);
    // Outside the mobile block the metadata line must stay hidden (desktop
    // columns carry that state).
    const outside = styles.slice(0, styles.indexOf(MOBILE_BLOCK_START));
    expect(ruleHas(outside, ".entry-mobile-meta {", /display:\s*none/)).toBe(true);
  });

  it("defines the compact back control inside the mobile block only", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".back-button {", /display:\s*grid/)).toBe(true);
    expect(ruleHas(block, ".back-button {", /2\.75rem/)).toBe(true);
    const outside = styles.slice(0, styles.indexOf(MOBILE_BLOCK_START));
    expect(ruleHas(outside, ".back-button {", /display:\s*none/)).toBe(true);
  });

  it("sizes mobile touch targets at 44px (2.75rem) on the nav, star, and more controls", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".nav-item {", /min-height:\s*3rem/)).toBe(true);
    expect(ruleHas(block, ".star-button, .row-menu-trigger {", /width:\s*2\.75rem;\s*height:\s*2\.75rem/)).toBe(true);
  });

  it("keeps bulk selection and atomic action controls touch-sized and wrapping on mobile", () => {
    const block = mobileBlock();
    const outside = styles.slice(0, styles.indexOf(MOBILE_BLOCK_START));
    expect(ruleHas(outside, ".entry-select-control {", /width:\s*2\.75rem/)).toBe(true);
    expect(ruleHas(outside, ".entry-select-control {", /height:\s*2\.75rem/)).toBe(true);
    expect(ruleHas(block, ".bulk-toolbar {", /flex-direction:\s*column/)).toBe(true);
    expect(ruleHas(block, ".bulk-toolbar-actions {", /repeat\(2,\s*minmax\(0,\s*1fr\)\)/)).toBe(true);
    expect(ruleHas(block, ".bulk-toolbar .button {", /min-height:\s*2\.75rem/)).toBe(true);
  });

  it("hides the desktop table columns on the mobile catalogue instead of squeezing them", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".entry-row--head {", /display:\s*none/)).toBe(true);
    expect(ruleHas(block, ".entry-row > .entry-meta {", /display:\s*none/)).toBe(true);
  });

  it("keeps the bottom navigation clearing the workspace even with safe-area insets", () => {
    const block = mobileBlock();
    expect(block).toContain("env(safe-area-inset-bottom)");
  });

  it("sizes the remaining compact controls (login submit, sign out, language switch) at the 44px floor", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".login-card form .button {", /min-height:\s*2\.75rem/)).toBe(true);
    expect(ruleHas(block, ".account-popover-signout {", /min-height:\s*2\.75rem/)).toBe(true);
    expect(ruleHas(block, ".language-switch button {", /min-height:\s*2\.75rem/)).toBe(true);
  });

  it("keeps Owner administration actions in the compact account popover instead of the mobile topbar", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".account-menu > .language-switch, .desktop-avatar, .account-name, .sign-out-button, .account-action-button {", /display:\s*none/)).toBe(true);
  });

  it("presents password change as a fullscreen mobile dialog with touch-sized actions", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".password-change-modal {", /height:\s*100dvh/)).toBe(true);
    expect(ruleHas(block, ".password-change-modal header .button {", /min-width:\s*2\.75rem;\s*min-height:\s*2\.75rem/)).toBe(true);
    expect(ruleHas(block, ".password-change-actions .button {", /min-height:\s*2\.75rem/)).toBe(true);
  });

  it("presents governance audit as a fullscreen mobile dialog with bounded horizontal rows", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".audit-modal {", /height:\s*100dvh/)).toBe(true);
    expect(ruleHas(block, ".audit-modal {", /border-radius:\s*0/)).toBe(true);
    expect(ruleHas(block, ".audit-table {", /min-width:\s*46rem/)).toBe(true);
    expect(ruleHas(block, ".audit-load-older {", /min-height:\s*2\.75rem/)).toBe(true);
  });

  it("presents scholarly records as a fullscreen mobile identity dialog with touch-sized controls", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".scholarly-records-modal {", /height:\s*100dvh/)).toBe(true);
    expect(ruleHas(block, ".scholarly-records-modal {", /border-radius:\s*0/)).toBe(true);
    expect(ruleHas(block, ".scholarly-record-create, .scholarly-attach-form, .scholarly-records-layout {", /grid-template-columns:\s*1fr/)).toBe(true);
    expect(ruleHas(block, ".scholarly-records-modal .button, .scholarly-records-modal select {", /min-height:\s*2\.75rem/)).toBe(true);
  });

  it("lays the preview Open/Download actions out side by side at the 44px floor", () => {
    const block = mobileBlock();
    expect(ruleHas(block, ".preview-open-button, .preview-download-button {", /flex:\s*1;\s*min-height:\s*2\.75rem/)).toBe(true);
  });
});
