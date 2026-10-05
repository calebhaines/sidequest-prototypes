import { useId, useMemo, useRef, useState } from "react";

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  log?: boolean;
  accent?: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function dialPoint(angle: number, radius = 42) {
  const radians = (angle * Math.PI) / 180;
  return [50 + Math.sin(radians) * radius, 50 - Math.cos(radians) * radius];
}

function dialArc(start: number, end: number) {
  const [startX, startY] = dialPoint(start);
  const [endX, endY] = dialPoint(end);
  return `M ${startX} ${startY} A 42 42 0 ${end - start > 180 ? 1 : 0} 1 ${endX} ${endY}`;
}

/** A native, keyboard-accessible slider underneath a custom rotary dial. */
export function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  format,
  log = false,
  accent = false,
}: KnobProps) {
  const id = useId();
  const useLog = log && min > 0 && max > min;
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max);
  const fraction =
    max === min
      ? 0
      : useLog
        ? Math.log(safeValue / min) / Math.log(max / min)
        : (safeValue - min) / (max - min);
  const angle = -135 + fraction * 270;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelled = useRef(false);
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  const displayValue = `${format ? format(safeValue) : safeValue.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;

  function update(next: number) {
    const stepped =
      step > 0 ? min + Math.round((next - min) / step) * step : next;
    onChange(clamp(Number(stepped.toFixed(8)), min, max));
  }

  function commit() {
    if (!cancelled.current && draft.trim() !== "") {
      const next = Number(draft);
      if (Number.isFinite(next)) update(next);
    }
    cancelled.current = false;
    setEditing(false);
  }

  return (
    <div className={`knob${accent ? " knob-accent" : ""}`}>
      <div className="knob-dial">
        <svg viewBox="0 0 100 100" className="knob-svg" aria-hidden="true">
          <path
            className="knob-track"
            d={dialArc(-135, 135)}
            fill="none"
            stroke="#e5e3df"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {fraction > 0.002 && (
            <path
              className="knob-progress"
              d={dialArc(-135, angle)}
              fill="none"
              stroke="#ee755c"
              strokeWidth="4"
              strokeLinecap="round"
            />
          )}
          <circle
            className="knob-face"
            cx="50"
            cy="50"
            r="34"
            fill="#f4f3ef"
            stroke="#e5e3df"
            strokeWidth="1"
          />
          <circle
            cx="50"
            cy="50"
            r="30.5"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            opacity="0.9"
          />
          <line
            className="knob-pointer"
            x1="50"
            y1="20"
            x2="50"
            y2="32"
            transform={`rotate(${angle} 50 50)`}
            stroke="#373d3a"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="2" fill="#e5e3df" />
        </svg>
        <input
          id={id}
          className="knob-range"
          type="range"
          min={useLog ? 0 : min}
          max={useLog ? 1000 : max}
          step={useLog ? 1 : step}
          value={useLog ? fraction * 1000 : safeValue}
          aria-label={label}
          aria-valuetext={displayValue}
          title={`${label}: ${displayValue}. Drag horizontally or use arrow keys.`}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            update(useLog ? min * Math.pow(max / min, next / 1000) : next);
          }}
        />
      </div>
      {editing ? (
        <input
          autoFocus
          className="knob-value knob-value-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={`${label} value${unit ? ` in ${unit}` : ""}`}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="knob-value"
          aria-label={`Edit ${label} value: ${displayValue}`}
          title="Click to enter an exact value"
          onClick={() => {
            setDraft(String(safeValue));
            setEditing(true);
          }}
        >
          {displayValue}
        </button>
      )}
      <label className="knob-label" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}

function seededNoise(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return (value - Math.floor(value)) * 2 - 1;
}

export function MiniWave({
  type,
  active = false,
}: {
  type: string;
  active?: boolean;
}) {
  const name = type.toLowerCase();
  const points: string[] = [];
  for (let index = 0; index <= 100; index++) {
    const t = index / 100;
    let sample: number;
    if (/noise|hat|snare|clap|shaker/.test(name)) {
      const envelope = /clap/.test(name)
        ? 0.45 + 0.55 * Math.abs(Math.sin(t * 18))
        : Math.exp(-t * 2.2);
      sample = seededNoise(index) * envelope;
    } else if (/square|pulse/.test(name)) {
      sample = Math.sin(t * Math.PI * 9) >= 0 ? 0.8 : -0.8;
    } else if (/saw/.test(name)) {
      sample = 2 * ((t * 4.5) % 1) - 1;
    } else if (/tri/.test(name)) {
      sample = 1 - 4 * Math.abs(Math.round(t * 4) - t * 4);
    } else if (/fm|metal|bell|ride/.test(name)) {
      sample = Math.sin(t * 35 + Math.sin(t * 78) * 2.5) * Math.exp(-t * 0.6);
    } else if (/click|transient|impulse/.test(name)) {
      sample = Math.sin(t * 190) * Math.exp(-t * 11);
    } else {
      sample =
        Math.sin(t * 30 + (1 - Math.exp(-t * 8)) * 5) * Math.exp(-t * 1.6);
    }
    points.push(
      `${index === 0 ? "M" : "L"}${index.toFixed(1)} ${(14 - sample * 11).toFixed(2)}`,
    );
  }
  return (
    <svg
      className={`mini-wave${active ? " is-active" : ""}`}
      viewBox="0 0 100 28"
      aria-hidden="true"
    >
      <path d="M0 14H100" stroke="currentColor" opacity="0.16" fill="none" />
      <path
        d={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Radix-2 FFT of real rendered audio, averaged across up to four windows. */
function spectrumOf(samples: Float32Array) {
  let size = 64;
  while (size < samples.length && size < 8192) size *= 2;
  const powers = new Float64Array(size / 2);
  const windowCount =
    samples.length > size ? Math.min(4, Math.ceil(samples.length / size)) : 1;
  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    const offset =
      windowCount === 1
        ? 0
        : Math.floor(
            (windowIndex * (samples.length - size)) / (windowCount - 1),
          );
    for (let index = 0; index < size; index++) {
      const sample = samples[index + offset] || 0;
      real[index] =
        sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1)));
    }
    for (let index = 1, reversed = 0; index < size; index++) {
      let bit = size >> 1;
      while (reversed & bit) {
        reversed ^= bit;
        bit >>= 1;
      }
      reversed ^= bit;
      if (index < reversed)
        [real[index], real[reversed]] = [real[reversed], real[index]];
    }
    for (let length = 2; length <= size; length *= 2) {
      const angle = (-2 * Math.PI) / length;
      const baseReal = Math.cos(angle);
      const baseImaginary = Math.sin(angle);
      for (let start = 0; start < size; start += length) {
        let rotationReal = 1;
        let rotationImaginary = 0;
        for (let index = 0; index < length / 2; index++) {
          const left = start + index;
          const right = left + length / 2;
          const rightReal =
            real[right] * rotationReal - imaginary[right] * rotationImaginary;
          const rightImaginary =
            real[right] * rotationImaginary + imaginary[right] * rotationReal;
          real[right] = real[left] - rightReal;
          imaginary[right] = imaginary[left] - rightImaginary;
          real[left] += rightReal;
          imaginary[left] += rightImaginary;
          const nextReal =
            rotationReal * baseReal - rotationImaginary * baseImaginary;
          rotationImaginary =
            rotationReal * baseImaginary + rotationImaginary * baseReal;
          rotationReal = nextReal;
        }
      }
    }
    for (let index = 0; index < powers.length; index++) {
      powers[index] +=
        (real[index] * real[index] + imaginary[index] * imaginary[index]) /
        windowCount;
    }
  }
  return powers;
}

export function WaveformDisplay({
  samples,
  mode,
  zoom,
  playing,
  sampleRate = 44100,
}: {
  samples: Float32Array;
  mode: "waveform" | "spectrum";
  zoom: number;
  playing: boolean;
  sampleRate?: number;
}) {
  const gradientId = useId().replaceAll(":", "");
  const magnification = clamp(Number.isFinite(zoom) ? zoom : 1, 1, 32);
  const visibleLength = Math.min(
    samples.length,
    Math.max(1, Math.floor(samples.length / magnification)),
  );
  const validSampleRate =
    Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
  const visibleDuration = visibleLength / validSampleRate;
  const timePrecision =
    visibleDuration < 0.25 ? 3 : visibleDuration < 2 ? 2 : 1;

  function frequencyLabel(frequency: number) {
    if (frequency >= 10000) return `${Math.round(frequency / 1000)}kHz`;
    if (frequency >= 1000) return `${(frequency / 1000).toFixed(1)}kHz`;
    if (frequency >= 100) return `${Math.round(frequency / 10) * 10}Hz`;
    return `${Math.round(frequency)}Hz`;
  }
  const waveform = useMemo(() => {
    const upper: string[] = [];
    const lower: string[] = [];
    const count = Math.min(900, Math.max(1, visibleLength));
    for (let bin = 0; bin < count; bin++) {
      const start = Math.floor((bin * visibleLength) / count);
      const end = Math.max(
        start + 1,
        Math.floor(((bin + 1) * visibleLength) / count),
      );
      let minimum = 0;
      let maximum = 0;
      for (let index = start; index < end; index++) {
        const sample = samples[index] || 0;
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
      }
      const peak = clamp(Math.max(Math.abs(minimum), Math.abs(maximum)), 0, 1);
      const x = count === 1 ? 0 : (bin * 1000) / (count - 1);
      upper.push(`${x.toFixed(2)} ${(65 - peak * 43).toFixed(2)}`);
      lower.push(`${x.toFixed(2)} ${(65 + peak * 43).toFixed(2)}`);
    }
    return `M${upper.join(" L")} L${lower.reverse().join(" L")} Z`;
  }, [samples, visibleLength]);

  const spectrum = useMemo(() => {
    if (mode !== "spectrum") return "";
    const power = spectrumOf(samples);
    let peak = 0;
    for (let index = 1; index < power.length; index++)
      peak = Math.max(peak, power[index]);
    const points: string[] = [];
    for (let index = 0; index <= 500; index++) {
      // A logarithmic axis from 1/1200 of Nyquist to Nyquist.
      const bin = Math.max(
        1,
        Math.pow(1200, index / 500 - 1) * (power.length - 1),
      );
      const left = Math.floor(bin);
      const right = Math.min(power.length - 1, left + 1);
      const interpolated =
        power[left] * (1 - (bin - left)) + power[right] * (bin - left);
      const decibels =
        peak > 0
          ? 10 * Math.log10(Math.max(interpolated / peak, 0.000000063))
          : -72;
      const y = 109 - clamp((decibels + 72) / 72, 0, 1) * 88;
      points.push(`${index * 2} ${y.toFixed(2)}`);
    }
    return `M0 109 L${points.join(" L")} L1000 109 Z`;
  }, [mode, samples]);

  return (
    <svg
      className={`waveform-svg${playing ? " is-playing" : ""}`}
      viewBox="0 0 1000 130"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        mode === "waveform"
          ? `Audio waveform at ${magnification} times zoom`
          : "Frequency spectrum of the rendered audio"
      }
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ee785e" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ee785e" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {[0, 250, 500, 750, 1000].map((x) => (
        <line
          key={`v${x}`}
          className="waveform-grid"
          x1={x}
          x2={x}
          y1="12"
          y2="110"
          stroke="#e3e4df"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
      ))}
      {[22, 65, 108].map((y) => (
        <line
          key={`h${y}`}
          className="waveform-grid"
          x1="0"
          x2="1000"
          y1={y}
          y2={y}
          stroke="#e3e4df"
          strokeWidth="1"
          strokeDasharray={y === 65 && mode === "waveform" ? undefined : "3 5"}
        />
      ))}
      {mode === "waveform" ? (
        <path
          className="waveform-fill"
          d={waveform}
          fill="#ef8069"
          opacity="0.88"
        />
      ) : (
        <path
          className="spectrum-fill"
          d={spectrum}
          fill={`url(#${gradientId})`}
          stroke="#ed795f"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {mode === "waveform"
        ? [0, 25, 50, 75, 100].map((percent, index) => (
            <text
              key={percent}
              className="waveform-axis-label"
              x={index * 250}
              y="128"
              fontSize="10"
              fill="#979d98"
              textAnchor={
                index === 0 ? "start" : index === 4 ? "end" : "middle"
              }
            >
              {((visibleDuration * percent) / 100).toFixed(timePrecision)}s
            </text>
          ))
        : [0, 25, 50, 75, 100].map((percent, index) => (
            <text
              key={percent}
              className="waveform-axis-label"
              x={index * 250}
              y="128"
              fontSize="10"
              fill="#979d98"
              textAnchor={
                index === 0 ? "start" : index === 4 ? "end" : "middle"
              }
            >
              {frequencyLabel(
                (validSampleRate / 2) * Math.pow(1200, percent / 100 - 1),
              )}
            </text>
          ))}
      {playing && (
        <circle
          className="waveform-playing-dot"
          cx="986"
          cy="10"
          r="3"
          fill="#ed795f"
        />
      )}
    </svg>
  );
}

export function EnvelopeDisplay({
  attack,
  decay,
  release,
}: {
  attack: number;
  decay: number;
  release: number;
}) {
  const safeAttack = Math.max(0, attack);
  const safeDecay = Math.max(0, decay);
  const safeRelease = Math.max(0, release);
  const duration = Math.max(1, safeAttack + safeDecay + safeRelease);
  const peakX = 4 + (safeAttack / duration) * 272;
  const decayX = peakX + (safeDecay / duration) * 272;
  const path = `M4 38 L${peakX} 5 C${peakX + (decayX - peakX) * 0.2} 27 ${peakX + (decayX - peakX) * 0.5} 35 ${decayX} 36 C${decayX + (276 - decayX) * 0.4} 37 276 38 276 38`;
  return (
    <svg
      className="envelope-svg"
      viewBox="0 0 280 42"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Amplitude envelope: ${attack} ms attack, ${decay} ms decay, ${release} ms release`}
    >
      <path d="M4 38H276" fill="none" stroke="#dddeda" strokeWidth="1" />
      <path d={`${path} L4 38Z`} fill="#f0ad95" opacity="0.2" />
      <path
        className="envelope-line"
        d={path}
        fill="none"
        stroke="#e78162"
        strokeWidth="1.7"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={peakX} cy="5" r="2.5" fill="#e78162" />
      <circle cx={decayX} cy="36" r="2" fill="#e78162" />
    </svg>
  );
}
