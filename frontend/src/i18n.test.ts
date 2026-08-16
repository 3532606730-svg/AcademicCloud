import { describe, expect, it } from "vitest";

import { ApiError } from "./api.ts";
import { DirectUploadError } from "./direct-upload.ts";
import {
  describeError,
  ERROR_MESSAGES,
  isLanguage,
  MESSAGES,
  resolveInitialLanguage,
  translate,
} from "./i18n.ts";

const storageWith = (value: string | null) => ({ getItem: () => value });

describe("resolveInitialLanguage", () => {
  it("selects zh-CN on a first run when the browser language starts with zh", () => {
    expect(resolveInitialLanguage({ localStorage: storageWith(null), navigator: { language: "zh-CN" } })).toBe("zh-CN");
    expect(resolveInitialLanguage({ localStorage: storageWith(null), navigator: { language: "zh-TW" } })).toBe("zh-CN");
    expect(resolveInitialLanguage({ localStorage: storageWith(null), navigator: { language: "ZH-hans" } })).toBe("zh-CN");
  });

  it("selects en on a first run for any other browser language", () => {
    expect(resolveInitialLanguage({ localStorage: storageWith(null), navigator: { language: "en-US" } })).toBe("en");
    expect(resolveInitialLanguage({ localStorage: storageWith(null), navigator: { language: "fr" } })).toBe("en");
    expect(resolveInitialLanguage({})).toBe("en");
  });

  it("restores a previously saved choice over the browser language", () => {
    expect(resolveInitialLanguage({ localStorage: storageWith("zh-CN"), navigator: { language: "en-US" } })).toBe("zh-CN");
    expect(resolveInitialLanguage({ localStorage: storageWith("en"), navigator: { language: "zh-CN" } })).toBe("en");
  });

  it("ignores invalid stored values", () => {
    expect(resolveInitialLanguage({ localStorage: storageWith("fr"), navigator: { language: "zh-CN" } })).toBe("zh-CN");
  });
});

describe("translate", () => {
  it("keeps both catalogs complete and key-identical", () => {
    const zh = Object.keys(MESSAGES["zh-CN"]).sort();
    const en = Object.keys(MESSAGES.en).sort();
    expect(zh).toEqual(en);
  });

  it("interpolates named parameters", () => {
    expect(translate("en", "upload.uploaded", { name: "paper.pdf" })).toBe("Uploaded “paper.pdf”.");
    expect(translate("zh-CN", "upload.etaSeconds", { seconds: 24 })).toBe("剩余约 24 秒");
  });

  it("carries the required Chinese phase and product strings", () => {
    expect(translate("zh-CN", "phase.queued")).toBe("排队等待");
    expect(translate("zh-CN", "phase.checksum")).toBe("正在计算校验值");
    expect(translate("zh-CN", "phase.reserving")).toBe("正在准备安全上传");
    expect(translate("zh-CN", "phase.uploading")).toBe("正在上传");
    expect(translate("zh-CN", "phase.verifying")).toBe("正在验证云端文件");
    expect(translate("zh-CN", "phase.complete")).toBe("上传完成");
    expect(translate("zh-CN", "phase.error")).toBe("需要处理");
    expect(translate("zh-CN", "nav.library")).toBe("资料库");
    expect(translate("zh-CN", "login.submit")).toBe("登录");
    expect(translate("en", "login.submit")).toBe("Sign in");
  });

  it("exposes both supported languages only", () => {
    expect(isLanguage("zh-CN")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
  });
});

describe("describeError", () => {
  it("localizes stable backend codes per language", () => {
    const error = new ApiError(503, "preview_unavailable");
    expect(describeError(error, "en")).toBe("Online preview is currently unavailable. You can download the file instead.");
    expect(describeError(error, "zh-CN")).toBe("在线预览暂不可用，可下载后查看。");
    expect(describeError(new ApiError(401, "invalid_credentials"), "zh-CN")).toBe("登录名或密码不正确。");
  });

  it("localizes cancellation and fallback messages", () => {
    const aborted = new DOMException("aborted", "AbortError");
    expect(describeError(aborted, "en")).toBe("The operation was cancelled.");
    expect(describeError(aborted, "zh-CN")).toBe("操作已取消。");
    expect(describeError(new Error("boom"), "zh-CN")).toBe("boom");
    expect(describeError(null, "zh-CN")).toBe("无法完成该操作。");
  });

  it("maps coded transport failures through the localized catalog, never raw English in zh-CN", () => {
    const unreachable = new DirectUploadError("upload_unreachable", "Could not reach object storage.");
    expect(describeError(unreachable, "zh-CN")).toBe("无法连接到对象存储，请检查网络后重试。");
    expect(describeError(unreachable, "en")).toBe("Could not reach object storage. Check your connection and try again.");
    expect(describeError(new DirectUploadError("upload_timed_out", "detail"), "zh-CN")).toBe("上传超时，请重试。");
    expect(describeError(new DirectUploadError("upload_stalled", "detail"), "zh-CN")).toBe("上传长时间没有进展，请检查网络后重试。");
    expect(describeError(new DirectUploadError("upload_rejected", "detail"), "en")).toBe("Object storage rejected the upload. Please try again.");
  });

  it("provides an English catalog entry for every code the backend emits", () => {
    for (const key of Object.keys(ERROR_MESSAGES.en)) {
      expect(ERROR_MESSAGES["zh-CN"][key], key).toBeTruthy();
    }
  });
});
