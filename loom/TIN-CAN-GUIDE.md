# TIN CAN

TIN CAN turns a recording into the sound of a smaller, more limited recording
path: an old receiver, a bullet microphone, a pocket recorder, a plastic toy or
a digital voice message. It is available in GALLEY’s track, return and master
inserts. Its effect ID is `tinpan`.

Start with **Bakelite rotary** or the **Call the pass** recipe for a telephone
vocal. Choose a device, then use the five front-panel knobs:

- **Drive** pushes the model’s input and overload character.
- **Tone** moves the voice from dark to bright.
- **Wear** changes the transducer’s roughness, damping and recovery.
- **Output** trims the processed level.
- **Blend** mixes the processed sound with the original stereo signal.

Changing a device keeps your knob settings. Choosing a recipe replaces the whole
setup. Compare at a similar listening level using Output; Drive is not an
automatic loudness match. Start with an existing recording or microphone input:
TIN CAN does not generate speech or add a prerecorded voice.

## Twelve recording paths

The software filter anchors below describe the model designs before the Tone,
Bandwidth, distance and wear adjustments. They are not measured specifications
of historical products. Filters are limited appropriately at low sample rates.

| Device | Filter anchors | Character |
| --- | --- | --- |
| Carbon handset · 1930s | 220–3,000 Hz | Granular, asymmetric and compressed |
| Bakelite rotary · 1950s | 300–3,300 Hz | Rounded telephone band and hollow receiver |
| Plastic handset · 1980s | 280–3,500 Hz | Cleaner, lighter analog telephone |
| Street payphone | 360–2,800 Hz | Hard, enclosed and forward |
| Kitchen intercom | 450–2,600 Hz | Boxy talkback with firm level control |
| Bullet harmonica mic | 85–6,200 Hz | Wider microphone body and rounded overload |
| Pocket cassette mic | 130–9,500 Hz | Small electret-style recording front end |
| Toy karaoke mic | 350–5,200 Hz | Nasal plastic casing and early breakup |
| Small megaphone | 450–4,500 Hz | Restricted bass and a barking horn middle |
| Contact pickup | 180–9,000 Hz | Thin, bright and mechanically resonant |
| 8 kHz digital handset | 300–3,400 Hz | Narrowband mu-law telephone PCM |
| Answering machine | 220–3,100 Hz | Soft voice-message path with four-bit ADPCM |

Each path combines bandwidth shaping, casing resonances and model-dependent
nonlinear dynamics. These are reduced-order musical interpretations rather than
measured microphone impulse responses or complete circuit simulations. The
contact-pickup mode reshapes recorded audio; it cannot recover the mechanical
vibrations of an actual surface. Pocket cassette mic models the microphone/front
end, without tape transport. Use PRESERVE for tape motion and magnetic colour.

## Folded controls

**Capsule & casing** exposes Bandwidth, Casing resonance and Mic distance.
Bandwidth at 1× leaves the device’s normal voice. Narrow it for a small speaker;
open it when a source loses too much body. Resonance emphasizes the casing’s
hollow or nasal shape. Distance changes the close-up contour without adding a
room recording, reverb or intentional predelay.

**Small-circuit dynamics** contains Level squeeze. It changes how strongly the
input is held in place while the device contributes its own overload and
recovery character. This is not calibrated studio compression; BUTTER remains
the tool for threshold, ratio, attack and release controls.

**Line & contacts** adds Hiss, Contact crackle and 50/60 Hz Line hum. All three
start at zero, and Wear does not secretly enable them. Added noise follows the
source envelope, so it fades when sound stops. The noise recipes deliberately
turn up the corresponding controls; turn those knobs back to zero for a clean
line. Noise here is an effect, not a recording of a real phone network.

**Message quality** lets the digital path follow the device or override it:

| Digital path | Word format | Notes |
| --- | --- | --- |
| Follow device | Device-dependent | First ten devices are analog; digital handset uses mu-law and answering machine uses IMA ADPCM. |
| Off | None | Bypasses the digital coder while retaining the microphone model. |
| Linear PCM | 4–12 bits | PCM word length selects the quantizer depth. Fractional automation values select the nearest whole-bit word length. |
| G.711 mu-law | 8 bits | The encoder/decoder uses the fixed eight-bit mu-law format. PCM word length is inactive. |
| IMA ADPCM | 4 bits | Stateful adaptive differential coding, with a predictor and adaptive step size. PCM word length is inactive. |

The default codec clock is 8 kHz, the narrowband telephone reference. Changing it
from 1 to 16 kHz or adding Clock jitter is an intentional creative extension;
those settings do not represent a compliant telephone channel. The codecs use
input filtering and output reconstruction. This models coding colour, not a
telephone connection, GSM/AMR speech synthesis, packet loss, network delay or
radio interference. The ADPCM path processes the four-bit coding state; it does
not create or import an IMA WAV file.

**One receiver or two** selects the wet channel routing. Mono is the default and
sums left/right into one receiver. Opposing stereo signals can cancel in that
fold; select Preserve stereo for wide sources or phase-opposed material. The dry
side of Blend keeps its original stereo image.

## Useful starting points

**Cupped bullet** pushes a harmonica-mic voice for a rough lead or vocal.
**Pocket diary** keeps two channels separate with a small recorder sound.
**Leave a message** uses adaptive differential coding without adding message
beeps. **Wire drum room** blends a driven microphone around the original drums.
**Soup-can chords** adds a quiet intercom layer to a pad, and **Pocket bass**
keeps the original bass foundation beneath the coloured voice. **Broken menu**
explicitly uses a 4 kHz, six-bit PCM toy path with clock jitter.

The filters change phase, so partial wet/dry blends can produce additional
cancellations. That is part of the parallel colour; use Blend at 100% to hear
only the modeled path. Analog paths add no intentional audio delay. Digital
paths retain their capture/reconstruction timing instead of pretending to be a
zero-phase filter.

## Projects, automation and CPU

Numeric controls support GALLEY automation and the four shared LFOs. Device and
codec selectors can be changed by hand and saved in projects or recipes. The
parameters also survive effect reorder, Undo/Redo and WAV/stem rendering.
Track freezing bakes TIN CAN and its automation, then removes its live processing.

The DSP uses a compact filter and transducer path, with digital coding active
only when selected. Steady playback does not recalculate static filter
coefficients for every sample. Bypass and Blend at zero settle to exact dry
through a short transition and suspend the coloured processing; a fresh dry or
bypassed instance starts dry. No convolution, large impulse response, external
recording or network request is required. The standalone app works offline.

## Design references

References checked on 31 October 2026. These establish device families, voice
bandwidth and coding algorithms; they do not supply measured model responses.

- [ITU-T G.711, Pulse code modulation of voice frequencies](https://www.itu.int/rec/T-REC-G.711/en), the narrowband telephone PCM and companding reference. The linked Recommendation and its reference code are distinct from GALLEY’s implementation.
- [ITU-T G.712, Transmission performance characteristics of PCM channels](https://www.itu.int/rec/T-REC-G.712/en), a reference for telephone-channel response requirements.
- [Voice frequency](https://en.wikipedia.org/wiki/Voice_frequency), an overview of the conventional approximately 300–3,400 Hz narrowband voice band.
- [Carbon microphone](https://en.wikipedia.org/wiki/Carbon_microphone), including its restricted response, granular contact mechanism and electrical noise.
- [Shure 520DX user guide](https://pubs.shure.com/view/guide/520DX/en-US.pdf), a current bullet-microphone family reference. Its stated 100–5,000 Hz response, omnidirectional pattern and high-impedance output are context for the family, not the response of TIN CAN’s Bullet mode.
- [Contact microphone](https://en.wikipedia.org/wiki/Contact_microphone), describing piezoelectric contact pickups and mechanical coupling.
- [IMA ADPCM algorithm description](https://wiki.multimedia.cx/index.php/IMA_ADPCM), including the four-bit sign/magnitude code, predictor, index and step adaptation.
