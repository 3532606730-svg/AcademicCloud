import argon2 from "argon2";

export const ARGON2ID_PARAMETERS = Object.freeze({
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});

export const PASSWORD_KDF_CONCURRENCY = 1;
export const PASSWORD_KDF_MAX_QUEUED = 4;

export class PasswordKdfOverloadedError extends Error {
  constructor() {
    super("Password hashing capacity is temporarily exhausted");
    this.name = "PasswordKdfOverloadedError";
  }
}

class BoundedExecutor {
  #active = 0;
  readonly #waiting: Array<(release: () => void) => void> = [];

  constructor(
    readonly concurrency: number,
    readonly maxQueued: number,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Password KDF concurrency must be a positive integer");
    }

    if (!Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new Error("Password KDF queue limit must be a non-negative integer");
    }
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const release = await this.#acquire();

    try {
      return await work();
    } finally {
      release();
    }
  }

  #acquire(): Promise<() => void> {
    if (this.#active < this.concurrency) {
      this.#active += 1;
      return Promise.resolve(this.#releaseOnce());
    }

    if (this.#waiting.length >= this.maxQueued) {
      return Promise.reject(new PasswordKdfOverloadedError());
    }

    return new Promise((resolve) => {
      this.#waiting.push(resolve);
    });
  }

  #releaseOnce(): () => void {
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      const next = this.#waiting.shift();

      if (next) {
        next(this.#releaseOnce());
      } else {
        this.#active -= 1;
      }
    };
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(encodedHash: string, password: string): Promise<boolean>;
}

export class Argon2idPasswordHasher implements PasswordHasher {
  readonly #executor: BoundedExecutor;

  constructor(concurrency = PASSWORD_KDF_CONCURRENCY, maxQueued = PASSWORD_KDF_MAX_QUEUED) {
    this.#executor = new BoundedExecutor(concurrency, maxQueued);
  }

  hash(password: string): Promise<string> {
    return this.#executor.run(() =>
      argon2.hash(password, {
        type: argon2.argon2id,
        ...ARGON2ID_PARAMETERS,
      }),
    );
  }

  verify(encodedHash: string, password: string): Promise<boolean> {
    return this.#executor.run(() => argon2.verify(encodedHash, password));
  }
}
