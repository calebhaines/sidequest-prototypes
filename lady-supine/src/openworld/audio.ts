export class GameAudio {
  private context: AudioContext | null = null;
  private enabled = false;
  private master: GainNode | null = null;
  private ambient: OscillatorNode[] = [];
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled && !this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.15;
      this.master.connect(this.context.destination);
      for (const frequency of [110, 164.81, 220]) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.value = 0.014; oscillator.connect(gain); gain.connect(this.master); oscillator.start();
        this.ambient.push(oscillator);
      }
    }
    if (enabled) void this.context?.resume();
    else void this.context?.suspend();
  }
  play(sound: string) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context, now = ctx.currentTime;
    const frequencies: Record<string, number[]> = { gather: [190, 240], hit: [90, 60], attack: [150, 100], craft: [330, 440, 660], fish: [392, 523, 659], time: [440, 554, 880], door: [220, 165], interact: [294, 392], hurt: [110, 70], step: [65], coin: [660, 880], build: [220, 330], level: [330, 440, 660, 880] };
    for (const [index, frequency] of (frequencies[sound] || [260]).entries()) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = now + index * 0.07;
      oscillator.type = sound === 'hurt' || sound === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.3, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain); gain.connect(this.master); oscillator.start(start); oscillator.stop(start + 0.24);
    }
  }
  destroy() { this.ambient.forEach(oscillator => oscillator.stop()); void this.context?.close(); }
}
