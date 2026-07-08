import { describe, it, expect } from 'vitest'
import { ruPathForEn, classifyFile } from './doc-translation-check.js'

describe('ruPathForEn', () => {
    it('maps docs/en path to docs/ru', () => {
        expect(ruPathForEn('docs/en/src/utils.html')).toBe('docs/ru/src/utils.html')
    })
})

describe('classifyFile', () => {
    it('marks new file as generated', () => {
        expect(classifyFile(null, 'content')).toBe('generated')
    })

    it('marks unchanged file as matched', () => {
        expect(classifyFile('content', 'content')).toBe('matched')
    })

    it('marks changed file as updated', () => {
        expect(classifyFile('old', 'new')).toBe('updated')
    })
})
