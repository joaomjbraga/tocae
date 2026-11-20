type AudioFocusTarget = {
  setAudioMuted(muted: boolean): void
}

export class LocalPlaybackAudioFocus {
  #localPlaybackActive = false

  setLocalPlaybackActive(active: boolean, targets: Iterable<AudioFocusTarget>): void {
    this.#localPlaybackActive = active
    for (const target of targets) target.setAudioMuted(active)
  }

  applyTo(target: AudioFocusTarget): void {
    target.setAudioMuted(this.#localPlaybackActive)
  }

  reset(): void {
    this.#localPlaybackActive = false
  }
}
