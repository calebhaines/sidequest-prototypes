export class GameAudio {
  private context: AudioContext | null = null;
  private enabled = false;
  private master: GainNode | null = null;
  private ambient: OscillatorNode[] = [];
  private rain: AudioBufferSourceNode | null = null;
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled && !this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.15;
      this.master.connect(this.context.destination);
      for (const frequency of [55, 82.1, 110.7]) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.value = 0.022; oscillator.connect(gain); gain.connect(this.master); oscillator.start();
        this.ambient.push(oscillator);
      }
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < samples.length; i++) { previous = .94 * previous + .06 * (Math.random() * 2 - 1); samples[i] = previous; }
      this.rain = this.context.createBufferSource(); this.rain.buffer = buffer; this.rain.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700;
      const rainGain = this.context.createGain(); rainGain.gain.value = .18;
      this.rain.connect(filter); filter.connect(rainGain); rainGain.connect(this.master); this.rain.start();
    }
    if (enabled) void this.context?.resume();
    else void this.context?.suspend();
  }
  play(sound: string) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context, now = ctx.currentTime;
    const frequencies: Record<string, number[]> = { gather: [150, 110], hit: [90, 60], attack: [150, 100], craft: [190, 142, 110], fish: [220, 165], time: [330, 246, 162], door: [220, 165], interact: [165, 124], hurt: [110, 70], step: [65], coin: [330, 246], build: [160, 120], level: [220, 165, 110], exchange: [55, 57, 83, 62, 41] };
    for (const [index, frequency] of (frequencies[sound] || [260]).entries()) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = now + index * 0.07;
      oscillator.type = sound === 'hurt' || sound === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.3, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain); gain.connect(this.master); oscillator.start(start); oscillator.stop(start + 0.24);
    }
  }
  destroy() { this.ambient.forEach(oscillator => oscillator.stop()); this.rain?.stop(); void this.context?.close(); }
}
