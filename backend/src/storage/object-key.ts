import { randomBytes } from "node:crypto";

const OBJECT_KEY_PATTERN = /^objects\/[0-9a-f]{2}\/[0-9a-f]{62}$/;

export function createObjectKey(): string {
  const opaqueId = randomBytes(32).toString("hex");

  return `objects/${opaqueId.slice(0, 2)}/${opaqueId.slice(2)}`;
}

export function assertValidObjectKey(objectKey: string): void {
  if (!OBJECT_KEY_PATTERN.test(objectKey)) {
    throw new Error("objectKey must be an application-generated opaque object key");
  }
}
