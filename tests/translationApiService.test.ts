import { describe, expect, it } from "vitest";
import { baiduLanguageCode, baiduSign, googleLanguageCode } from "../electron/services/TranslationApiService";

describe("TranslationApiService", () => {
  it("maps common language names per provider", () => {
    expect(googleLanguageCode("Chinese")).toBe("zh-CN");
    expect(googleLanguageCode("English")).toBe("en");
    expect(baiduLanguageCode("Chinese")).toBe("zh");
    expect(baiduLanguageCode("English")).toBe("en");
    expect(googleLanguageCode("ja")).toBe("ja");
    expect(baiduLanguageCode("jp")).toBe("jp");
  });

  it("builds Baidu md5 signatures", () => {
    expect(baiduSign("2015063000000001", "apple", "65478", "1234567890"))
      .toBe("a1a7461d92e5194c5cae3182b5b24de1");
  });
});
