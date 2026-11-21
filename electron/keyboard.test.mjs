import assert from 'node:assert/strict'
import test from 'node:test'
import { isEditableTextTarget } from '../src/lib/keyboard.ts'

test('identifies textareas and editable text targets for global keyboard shortcuts', () => {
  const textarea = Object.assign(new EventTarget(), { tagName: 'TEXTAREA' })
  const contentEditable = Object.assign(new EventTarget(), {
    tagName: 'DIV',
    isContentEditable: true,
  })
  const textbox = Object.assign(new EventTarget(), {
    tagName: 'DIV',
    getAttribute: (name) => name === 'role' ? 'textbox' : null,
  })
  const button = Object.assign(new EventTarget(), { tagName: 'BUTTON' })

  assert.equal(isEditableTextTarget(textarea), true)
  assert.equal(isEditableTextTarget(contentEditable), true)
  assert.equal(isEditableTextTarget(textbox), true)
  assert.equal(isEditableTextTarget(button), false)
  assert.equal(isEditableTextTarget(null), false)
})
