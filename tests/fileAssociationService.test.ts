import { describe, expect, it } from "vitest";
import { parseWindowsAssociationStatus } from "../electron/services/FileAssociationService";

describe("FileAssociationService", () => {
  const exePath = "C:\\Program Files\\Paper Reader Plus\\Paper Reader Plus.exe";
  const command = `"${exePath}" "%1"`;

  it("distinguishes unregistered, registered-only, and effective default handlers", () => {
    const status = parseWindowsAssociationStatus({
      ".readerp": {},
      ".readerm": {
        extensionDefault: "PaperReaderPlus.ReaderM",
        userChoiceProgId: "Other.App",
        command,
      },
      ".md": {
        extensionDefault: "PaperReaderPlus.Markdown",
        userChoiceProgId: "PaperReaderPlus.Markdown",
        command,
      },
    }, exePath);

    expect(status.find((item) => item.extension === ".readerp")).toMatchObject({ registered: false, associated: false });
    expect(status.find((item) => item.extension === ".readerm")).toMatchObject({ registered: true, associated: false });
    expect(status.find((item) => item.extension === ".md")).toMatchObject({ registered: true, associated: true });
  });
});
