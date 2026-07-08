import { describe, it, expect } from 'vitest'
import { classifyFile } from './project-spec-check.js'

describe('classifyFile', () => {
    it('marks new file as generated', () => {
        expect(classifyFile(null, 'content', 'matched')).toBe('generated')
    })

    it('marks unchanged file as matched', () => {
        expect(classifyFile('content', 'content', 'matched')).toBe('matched')
    })

    it('marks changed file as updated', () => {
        expect(classifyFile('old', 'new', 'matched')).toBe('updated')
    })

    it('normalizes line endings before comparing', () => {
        expect(classifyFile('a\r\nb', 'a\nb', 'matched')).toBe('matched')
    })
})
