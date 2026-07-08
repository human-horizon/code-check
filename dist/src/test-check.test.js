import { describe, it, expect } from 'vitest';
import { testFileForCode, buildReport } from './test-check.js';
function codeFile(relativePath, lang) {
    return {
        lang,
        relativePath,
        absolutePath: `/project/${relativePath}`,
    };
}
describe('testFileForCode', () => {
    it('maps typescript to .test.ts', () => {
        expect(testFileForCode(codeFile('src/hello.ts', 'typescript'))).toBe('src/hello.test.ts');
    });
    it('maps go to _test.go', () => {
        expect(testFileForCode(codeFile('src/hello.go', 'go'))).toBe('src/hello_test.go');
    });
    it('returns null for rust', () => {
        expect(testFileForCode(codeFile('src/main.rs', 'rust'))).toBeNull();
    });
});
describe('buildReport', () => {
    it('classifies generated entries', () => {
        const report = buildReport('/project', [], [
            {
                path: 'src/hello.test.ts',
                action: 'generated-tests',
                description: 'ok',
            },
        ], []);
        expect(report.generated).toHaveLength(1);
        expect(report.matched).toBe(0);
    });
});
