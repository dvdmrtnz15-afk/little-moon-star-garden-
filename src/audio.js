/** Original synthesized cues. No samples, requests, microphone or account. */
export class GardenAudio {
  constructor() { this.enabled = false; this.context = null; this.master = null; }
  async setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) { if (this.context?.state === 'running') await this.context.suspend(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.11;
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
  }
  play(kind = 'touch') {
    if (!this.enabled || this.context?.state !== 'running') return;
    const sequences = { touch:[523.25], remember:[392,587.33,783.99], bloom:[329.63,440,523.25,659.25], star:[523.25,659.25,783.99,1046.5], step:[261.63,392] };
    const now = this.context.currentTime;
    for (const [i, pitch] of (sequences[kind] || sequences.touch).entries()) {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      const time = now + i * 0.13;
      oscillator.type = 'sine'; oscillator.frequency.value = pitch;
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(0.32, time + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.9);
      oscillator.connect(envelope); envelope.connect(this.master);
      oscillator.start(time); oscillator.stop(time + 1);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }
  }
  dispose() { this.context?.close(); }
}
