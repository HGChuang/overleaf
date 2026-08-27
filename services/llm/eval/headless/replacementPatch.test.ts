import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyReplacementPatch,
  UnsupportedPatchError,
} from './replacementPatch.js'

test('replaces the occurrence nearest the line hint', () => {
  const input = new Map([['main.tex', 'same\nkeep\nsame\n']])
  const result = applyReplacementPatch(input, [
    {
      file: 'main.tex',
      line: 3,
      oldText: 'same',
      newText: 'changed',
    },
  ])

  assert.equal(result.files.get('main.tex'), 'same\nkeep\nchanged\n')
  assert.equal(input.get('main.tex'), 'same\nkeep\nsame\n')
})

test('falls back to the first occurrence without a line hint', () => {
  const result = applyReplacementPatch(new Map([['main.tex', 'x x']]), [
    { file: 'main.tex', line: null, oldText: 'x', newText: 'y' },
  ])
  assert.equal(result.files.get('main.tex'), 'y x')
})

for (const hunk of [
  { file: 'main.tex', line: 1, oldText: '', newText: 'insert' },
  { file: 'main.tex', line: 1, oldText: 'delete', newText: '' },
  { file: null, line: 1, oldText: 'x', newText: 'y' },
]) {
  test(`rejects unsupported hunk ${JSON.stringify(hunk)}`, () => {
    assert.throws(
      () => applyReplacementPatch(new Map([['main.tex', 'delete x']]), [hunk]),
      UnsupportedPatchError
    )
  })
}
