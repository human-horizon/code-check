import { describe, it, expect } from "vitest";
import { ruPathForEn, classifyFile } from "./doc-translation-check.js";
describe("ruPathForEn", () => {
    it("maps a VitePress English path to the Russian locale path", () => {
        expect(ruPathForEn("docs/src/utils.md")).toBe("docs/ru/src/utils.md");
        expect(ruPathForEn("docs/index.md")).toBe("docs/ru/index.md");
    });
    it("does not remap an existing Russian locale path", () => {
        expect(ruPathForEn("docs/ru/src/utils.md")).toBe("docs/ru/src/utils.md");
    });
});
describe("classifyFile", () => {
    it("marks new file as generated", () => {
        expect(classifyFile(null, "content")).toBe("generated");
    });
    it("marks unchanged file as matched", () => {
        expect(classifyFile("content", "content")).toBe("matched");
    });
    it("marks changed file as updated", () => {
        expect(classifyFile("old", "new")).toBe("updated");
    });
});
