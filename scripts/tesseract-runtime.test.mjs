import assert from "node:assert/strict";
import test from "node:test";

import { verifyLddResolution } from "./tesseract-runtime.mjs";

const releaseLibrary = "/home/runner/work/AcademicCloud/AcademicCloud/output/release/runtime/tesseract/lib";

test("ldd verification allows only the current release-local closure plus system baselines", () => {
  const valid = `
    libtesseract.so.5.5 => ${releaseLibrary}/libtesseract.so.5.5 (0x0001)
    liblept.so.5 => ${releaseLibrary}/liblept.so.5 (0x0002)
    libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x0003)
    libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x0004)
  `;
  assert.doesNotThrow(() => verifyLddResolution(valid, releaseLibrary));

  assert.throws(
    () => verifyLddResolution(valid.replace(
      `${releaseLibrary}/liblept.so.5`,
      "/home/runner/work/AcademicCloud/AcademicCloud/output/build/liblept.so.5",
    ), releaseLibrary),
    /escaped local library directory/u,
  );
  assert.throws(
    () => verifyLddResolution(valid.replace(
      "/lib/x86_64-linux-gnu/libc.so.6",
      "/tmp/academiccloud-tesseract-5.5.3/install/lib/libc.so.6",
    ), releaseLibrary),
    /baseline dependency resolved into a build workspace/u,
  );
  assert.throws(
    () => verifyLddResolution(`${valid}\nlibpng16.so.16 => not found`, releaseLibrary),
    /dynamic dependency is unresolved/u,
  );
});
