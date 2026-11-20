import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalPlaybackAudioFocus } from './audioFocus.ts'

function createAudioTarget() {
  const muteStates = []
  return {
    muteStates,
    setAudioMuted(muted) {
      muteStates.push(muted)
    },
  }
}

test('mutes existing YouTube Music views while local playback is active', () => {
  const focus = new LocalPlaybackAudioFocus()
  const serviceView = createAudioTarget()
  const authenticationWindow = createAudioTarget()

  focus.setLocalPlaybackActive(true, [serviceView, authenticationWindow])

  assert.deepEqual(serviceView.muteStates, [true])
  assert.deepEqual(authenticationWindow.muteStates, [true])
})

test('new YouTube Music views inherit the current local playback state', () => {
  const focus = new LocalPlaybackAudioFocus()
  focus.setLocalPlaybackActive(true, [])
  const newAuthenticationWindow = createAudioTarget()

  focus.applyTo(newAuthenticationWindow)

  assert.deepEqual(newAuthenticationWindow.muteStates, [true])
})

test('unmutes existing and new views when local playback stops', () => {
  const focus = new LocalPlaybackAudioFocus()
  const serviceView = createAudioTarget()
  focus.setLocalPlaybackActive(true, [serviceView])

  focus.setLocalPlaybackActive(false, [serviceView])
  const newAuthenticationWindow = createAudioTarget()
  focus.applyTo(newAuthenticationWindow)

  assert.deepEqual(serviceView.muteStates, [true, false])
  assert.deepEqual(newAuthenticationWindow.muteStates, [false])
})
