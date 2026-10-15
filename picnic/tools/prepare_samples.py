#!/usr/bin/env python3
"""Prepare PICNIC's authentic, deduplicated City Folk sample library.

Python 3 standard library only. The original ZIP is an explicit input, never a
runtime dependency. No normalization, sample cropping or lossy encoding occurs.
The ten 6 kHz source samples are linearly resampled to 8 kHz for Web Audio.
"""
from __future__ import annotations

import argparse
import base64
import collections
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import struct
import zipfile

SOURCE_SHA256 = "0e3cb4214ec373548b2fcc625aa01d60fd76f2b363064b1df38197a3cbbbf7d2"
ROOT = Path(__file__).resolve().parent.parent
TOWNS = {
    "BANK_TOWN.sf2": "Town daytime",
    "BANK_TOWN_MORNING.sf2": "Town morning",
    "BANK_TOWN_NIGHT.sf2": "Town night",
    "BANK_TOWN_MIDNIGHT.sf2": "Town midnight",
    "BANK_Town_First.sf2": "First day in town",
}
NAMED = {
    "A_GTR_AS1": ("Acoustic guitar AS1", "Plucked"),
    "A_GTR_AS2": ("Acoustic guitar AS2", "Plucked"),
    "BIWA": ("Biwa", "Plucked"),
    "CELLO": ("Cello", "Bowed"),
    "CNT_BASS": ("Upright bass", "Bass"),
    "CONGA": ("Conga", "Percussion"),
    "E_GTR_ES1": ("Electric guitar ES1", "Plucked"),
    "E_GTR_ES2": ("Electric guitar ES2", "Plucked"),
    "G_PIANO": ("Grand piano", "Keys"),
    "HARP": ("Harp", "Plucked"),
    "JAMBE": ("Djembe", "Percussion"),
    "TIMPANI": ("Timpani", "Percussion"),
    "UKULELE": ("Ukulele", "Plucked"),
    "VIBRAPHONE": ("Vibraphone", "Mallets"),
    "VIOLA": ("Viola", "Bowed"),
    "WADAIKO": ("Wadaiko", "Percussion"),
    "W_PIANO": ("Piano W", "Keys"),
}
SPECIES = {
    "ANT": "Anteater", "BEA": "Bear", "BRD": "Bird", "BUL": "Bull",
    "CAT": "Cat", "CHN": "Chicken", "COW": "Cow", "CRD": "Crocodile",
    "DOG": "Dog", "DUK": "Duck", "ELP": "Elephant", "FLG": "Frog",
    "GOA": "Goat", "GOR": "Gorilla", "HIP": "Hippo", "HRS": "Horse",
    "KAL": "Koala", "KGR": "Kangaroo", "LON": "Lion", "MNK": "Monkey",
    "MUS": "Mouse", "OCT": "Octopus", "OST": "Ostrich", "PBR": "Cub",
    "PGN": "Penguin", "PIG": "Pig", "RBT": "Rabbit", "RHN": "Rhino",
    "SHP": "Sheep", "SQU": "Squirrel", "TIG": "Tiger", "WOL": "Wolf",
}
EXTRAS = {"BANK_CAFE.sf2", "BANK_ABLESISTERS.sf2", "BANK_MELODY_ETC_CHIME.sf2"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compact(value) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def bank_id(filename: str) -> str:
    return slug(Path(filename).stem.removeprefix("BANK_"))


def preset_id(filename: str, bank: int, program: int) -> str:
    return f"{bank_id(filename)}-p{bank}-{program}"


def chunks(data: bytes, start: int = 0):
    while start + 8 <= len(data):
        tag, size = struct.unpack_from("<4sI", data, start)
        begin, end = start + 8, start + 8 + size
        if end > len(data):
            raise ValueError(f"Truncated RIFF chunk {tag!r}")
        yield tag.decode("ascii"), data[begin:end]
        start = end + size % 2
    if start != len(data):
        raise ValueError("Malformed trailing RIFF data")


def records(data: bytes, fmt: str):
    size = struct.calcsize(fmt)
    if len(data) % size:
        raise ValueError("Incomplete SoundFont table record")
    return list(struct.iter_unpack(fmt, data))


def string(raw: bytes) -> str:
    return raw.split(b"\0", 1)[0].decode("cp1252")


def signed(value: int) -> int:
    return value - 65536 if value > 32767 else value


def seconds(timecents: int) -> float:
    return 0.0 if timecents == -32768 else round(2 ** (timecents / 1200), 9)


def selected(filename: str) -> bool:
    upper = filename.upper()
    return ("MELODY_INST_" in upper or
            "MELODY_" in upper and "INST_" not in upper and "ETC_" not in upper or
            upper.startswith("BANK_MU") and upper != "BANK_MUSEUM.SF2" or
            filename in TOWNS or filename in EXTRAS)


def priority(filename: str):
    if "MELODY_INST_" in filename: return (0, filename.casefold())
    if filename in TOWNS: return (1, filename.casefold())
    if "MELODY_" in filename and "ETC_" not in filename: return (2, filename.casefold())
    return (3, filename.casefold())


def bank_label(filename: str) -> tuple[str, str]:
    if filename in TOWNS: return TOWNS[filename], "Town palettes"
    stem = Path(filename).stem.removeprefix("BANK_")
    if stem.startswith("MELODY_INST_"):
        return NAMED.get(stem.removeprefix("MELODY_INST_"), (stem, "Instruments"))
    if stem.startswith("MELODY_") and not stem.startswith("MELODY_ETC_"):
        code = stem.removeprefix("MELODY_")
        parts = code.split("_")
        if parts[0] in SPECIES:
            return "Villager " + SPECIES[parts[0]] + (" · " + " ".join(parts[1:]) if len(parts) > 1 else ""), "Neighbors"
        return "Villager " + code.replace("_", " "), "Neighbors"
    if re.match(r"MU\d", stem, re.I):
        match = re.match(r"MU(\d+)_?(.*)", stem, re.I)
        return f"Song palette {int(match[1]):02d} · {match[2].replace('_', ' ')}", "Song palettes"
    return {"CAFE": ("Café", "Places"), "ABLESISTERS": ("Able Sisters", "Places"),
            "MELODY_ETC_CHIME": ("Town chime", "Mallets")}.get(stem, (stem.replace("_", " "), "Places"))


def resample_pcm16(pcm: bytes, source_rate: int, target_rate: int) -> bytes:
    """Integer linear interpolation, nearest integer with ties away from zero."""
    source = [item[0] for item in struct.iter_unpack("<h", pcm)]
    frames = max(1, (len(source) * target_rate + source_rate // 2) // source_rate)
    output = bytearray(frames * 2)
    for index in range(frames):
        left, fraction = divmod(index * source_rate, target_rate)
        left = min(left, len(source) - 1)
        right = min(left + 1, len(source) - 1)
        numerator = source[left] * (target_rate - fraction) + source[right] * fraction
        value = (abs(numerator) + target_rate // 2) // target_rate
        struct.pack_into("<h", output, index * 2, -value if numerator < 0 else value)
    return bytes(output)


def merged_regions(regions):
    """Merge adjacent key ranges only when every other playback value agrees."""
    groups = collections.defaultdict(list)
    for region in regions:
        groups[compact({k: v for k, v in region.items() if k != "key"})].append(region)
    output = []
    for group in groups.values():
        previous = None
        for region in sorted(group, key=lambda r: r["key"]):
            if previous is not None and region["key"][0] == previous["key"][1] + 1:
                previous["key"][1] = region["key"][1]
            else:
                previous = {**region, "key": region["key"][:]}
                output.append(previous)
    return sorted(output, key=lambda r: (r["key"], r["velocity"], r["sample"], compact(r)))


class Library:
    def __init__(self):
        self.samples, self.sample_sources, self.presets, self.banks = {}, {}, [], []
        self.input_ids, self.equivalent, self.transformations = {}, {}, []
        self.generator_counts = collections.Counter()

    def sample(self, filename, index, header, smpl):
        name, start, end, loop_start, loop_end, rate, root, correction, link, kind = header
        if kind != 1 or not 0 <= start < end <= len(smpl) // 2:
            raise ValueError(f"Unsupported sample or bounds: {filename} sample {index}")
        pcm = smpl[start * 2:end * 2]
        source_pcm_hash, source_rate, source_frames = digest(pcm), rate, end - start
        if rate < 8000:
            pcm = resample_pcm16(pcm, rate, 8000)
            loop_start = round((loop_start - start) * 8000 / rate)
            loop_end = round((loop_end - start) * 8000 / rate)
            rate, start = 8000, 0
        else:
            loop_start, loop_end = loop_start - start, loop_end - start
        sample_id = "s-" + digest(struct.pack("<I", rate) + pcm)[:20]
        metadata = {"sampleRate": rate, "frames": len(pcm) // 2, "data": base64.b64encode(pcm).decode("ascii")}
        if sample_id in self.samples and self.samples[sample_id] != metadata:
            raise ValueError("Sample ID collision")
        self.samples[sample_id] = metadata
        self.sample_sources.setdefault(sample_id, []).append({"originalBank": filename, "sampleIndex": index,
            "sampleName": string(name), "pcmSha256": source_pcm_hash, "sampleRate": source_rate,
            "frames": source_frames})
        if source_rate != rate and sample_id not in {t["sample"] for t in self.transformations}:
            self.transformations.append({"sample": sample_id, "sourceRate": source_rate, "targetRate": rate,
                "sourceFrames": source_frames, "targetFrames": len(pcm) // 2, "method": "integer-linear-pcm16"})
        return sample_id, loop_start, loop_end, root, correction

    def parse(self, filename, data):
        if data[:4] != b"RIFF" or data[8:12] != b"sfbk" or struct.unpack_from("<I", data, 4)[0] != len(data) - 8:
            raise ValueError("Not a complete SoundFont RIFF: " + filename)
        tables = {}
        for tag, body in chunks(data, 12):
            if tag == "LIST": tables.update(dict(chunks(body, 4)))
        if "sm24" in tables: raise ValueError("24-bit sample extension requires explicit handling")
        phdr = records(tables["phdr"], "<20sHHHIII")
        inst = records(tables["inst"], "<20sH")
        shdr = records(tables["shdr"], "<20sIIIIIBbHH")
        bags = {kind: records(tables[kind + "bag"], "<HH") for kind in ("p", "i")}
        generators = {kind: records(tables[kind + "gen"], "<HH") for kind in ("p", "i")}
        if len(tables["pmod"]) != 10 or len(tables["imod"]) != 10:
            raise ValueError("SoundFont contains custom modulators: " + filename)
        def zones(kind, begin, end):
            result = []
            for at in range(begin, end):
                start, finish = bags[kind][at][0], bags[kind][at + 1][0]
                entries = generators[kind][start:finish]
                if len(dict(entries)) != len(entries): raise ValueError("Duplicate generator in one zone")
                for generator, value in entries: self.generator_counts[f"{kind}:{generator}"] += 1
                result.append(dict(entries))
            return result
        sample_refs = {}
        bank_name, category = bank_label(filename)
        bank = {"id": bank_id(filename), "name": bank_name, "category": category, "originalBank": filename,
                "sha256": digest(data), "sourcePresets": len(phdr) - 1, "presets": []}
        for preset_index, preset in enumerate(phdr[:-1]):
            raw_name, program, bank_number, first_bag, *_ = preset
            pglobal, output = {}, []
            pzones = zones("p", first_bag, phdr[preset_index + 1][3])
            reverb = 0
            for pzone in pzones:
                if set(pzone) - {16, 41, 43, 44}: raise ValueError("Unsupported preset generator")
                if 41 not in pzone:
                    pglobal = pzone
                    continue
                pvalues = {**pglobal, **pzone}
                instrument = pvalues[41]
                reverb = pvalues.get(16, 0) / 1000
                iglobal = {}
                for izone in zones("i", inst[instrument][1], inst[instrument + 1][1]):
                    if set(izone) - {17, 34, 36, 37, 38, 43, 44, 48, 53, 54, 58}:
                        raise ValueError("Unsupported instrument generator")
                    if 53 not in izone:
                        iglobal = izone
                        continue
                    z = {**iglobal, **izone}
                    index = z[53]
                    if index not in sample_refs:
                        sample_refs[index] = self.sample(filename, index, shdr[index], tables["smpl"])
                    sample_id, ls, le, root, correction = sample_refs[index]
                    def bounds(op):
                        iv, pv = z.get(op, 127 << 8), pvalues.get(op, 127 << 8)
                        return [max(iv & 255, pv & 255), min(iv >> 8, pv >> 8)]
                    key, velocity = bounds(43), bounds(44)
                    if key[0] > key[1] or velocity[0] > velocity[1]: continue
                    mode = z.get(54, 0) & 3
                    if mode not in (0, 1, 3): raise ValueError("Unsupported loop mode")
                    if mode and not 0 <= ls < le <= self.samples[sample_id]["frames"]:
                        raise ValueError(f"Invalid loop: {filename} sample {index}")
                    region = {"sample": sample_id, "key": key, "velocity": velocity,
                        "root": z.get(58, root), "tune": correction,
                        "gain": round(10 ** (-signed(z.get(48, 0)) / 200), 9),
                        "pan": round(max(-1, min(1, signed(z.get(17, 0)) / 500)), 9),
                        "loop": mode in (1, 3), "loopMode": mode,
                        "loopStart": ls if mode else 0, "loopEnd": le if mode else 0,
                        "attack": seconds(signed(z.get(34, 53536))),
                        "decay": seconds(signed(z.get(36, 53536))),
                        "sustain": round(10 ** (-signed(z.get(37, 0)) / 200), 9),
                        "release": seconds(signed(z.get(38, 53536)))}
                    if not 0 <= region["root"] <= 127: raise ValueError("Invalid root")
                    output.append(region)
            output = merged_regions(output)
            if not output: raise ValueError("Empty source preset: " + filename)
            source_id = preset_id(filename, bank_number, program)
            alias = {"id": source_id, "originalBank": filename, "bank": bank["id"],
                     "bankNumber": bank_number, "program": program, "sourcePresetName": string(raw_name)}
            suffix = "" if len(phdr) == 2 else " · voice " + str(program + 1)
            name = bank_name + suffix
            signature = digest(compact({"regions": output, "reverbSend": reverb}).encode())
            if signature in self.equivalent:
                item = self.equivalent[signature]
                item["aliases"].append({**alias, "name": name})
            else:
                item = {**alias, "name": name, "category": category, "regions": output,
                        "reverbSend": reverb, "aliases": []}
                self.presets.append(item)
                self.equivalent[signature] = item
            self.input_ids[source_id] = item["id"]
            if item["id"] not in bank["presets"]: bank["presets"].append(item["id"])
        self.banks.append(bank)

    def resolve(self, value):
        return self.input_ids[value]

    def percussion_kit(self):
        regions, sources = [], []
        for name, count in (("CONGA", 4), ("JAMBE", 2), ("WADAIKO", 4)):
            for program in range(count):
                source_id = self.resolve(preset_id("BANK_MELODY_INST_" + name + ".sf2", 0, program))
                source = next(p for p in self.presets if p["id"] == source_id)
                note = 36 + len(regions)
                if len(source["regions"]) != 1: raise ValueError("Expected one percussion region")
                original = source["regions"][0]
                regions.append({**original, "key": [note, note], "root": note})
                sources.append({"key": note, "preset": source_id, "sourceRoot": original["root"], "name": source["name"]})
        item = {"id": "picnic-percussion-kit", "name": "Picnic percussion kit", "category": "Percussion",
                "bank": "picnic", "bankNumber": 0, "program": 0, "originalBank": "PICNIC authored mapping",
                "sourcePresetName": "Ten recorded conga, djembe and wadaiko strikes", "regions": regions,
                "reverbSend": 0, "aliases": [], "authored": True, "sourceMapping": sources,
                "drumNotes": [{"pitch": source["key"], "name": source["name"]} for source in sources]}
        self.presets.insert(0, item)


def read_archive(path):
    data = path.read_bytes()
    if digest(data) != SOURCE_SHA256: raise ValueError("Source ZIP SHA-256 mismatch")
    with zipfile.ZipFile(path) as archive:
        members = {}
        for item in archive.infolist():
            p = PurePosixPath(item.filename)
            if item.is_dir(): continue
            if len(p.parts) != 1 or p.suffix.lower() != ".sf2" or p.name in members or item.file_size > 32 * 1024 * 1024:
                raise ValueError("Unexpected source ZIP member: " + item.filename)
            members[p.name] = archive.read(item)
        if len(members) != 278: raise ValueError("Unexpected source bank count")
    return members


def generate(archive, output):
    members, library = read_archive(archive), Library()
    for name in sorted((name for name in members if selected(name)), key=priority):
        library.parse(name, members[name])
    library.percussion_kit()
    defaults = {
        "melody": library.resolve("melody-inst-g-piano-p0-6"),
        "chords": library.resolve("melody-inst-ukulele-p0-0"),
        "bass": library.resolve("melody-inst-cnt-bass-p0-0"),
        "drums": "picnic-percussion-kit",
        "neighbors": library.resolve("melody-cat-f-p0-0"),
        "texture": library.resolve("melody-inst-vibraphone-p0-0"),
    }
    moods = [("morning", "Town morning", "BANK_TOWN_MORNING.sf2", [0, 1, 2]),
             ("daytime", "Town daytime", "BANK_TOWN.sf2", [0, 3, 1]),
             ("night", "Town night", "BANK_TOWN_NIGHT.sf2", [0, 2, 1]),
             ("midnight", "Town midnight", "BANK_TOWN_MIDNIGHT.sf2", [0, 6, 8]),
             ("arrival", "First day in town", "BANK_Town_First.sf2", [0, 1, 2])]
    palettes = [{"id": mood, "name": name, "originalBank": filename,
                 "presets": [library.resolve(preset_id(filename, 0, p)) for p in programs] +
                            [defaults[role] for role in ("drums", "neighbors", "texture")]} for mood, name, filename, programs in moods]
    used = {r["sample"] for p in library.presets for r in p["regions"]}
    library.samples = {k: v for k, v in sorted(library.samples.items()) if k in used}
    manifest = {"version": 1, "samples": {}, "presets": library.presets, "banks": library.banks,
                "defaults": defaults, "palettes": palettes, "presetAliases": library.input_ids,
                "provenance": {"title": "Animal Crossing: City Folk", "sourceArchive": archive.name,
                               "sha256": SOURCE_SHA256, "sourceBanks": len(members)}}
    manifest_js = "/* PICNIC sample mapping; generated by tools/prepare_samples.py. */\nwindow.PicnicLibrary=" + compact(manifest) + ";\n"
    samples_js = "/* Authentic mono PCM16; decoded lazily. Generated; do not edit. */\nObject.assign(window.PicnicLibrary.samples," + compact(library.samples) + ");\n"
    if len(manifest_js.encode()) + len(samples_js.encode()) > 23 * 1024 * 1024:
        raise ValueError("PICNIC embedded library exceeds the 23 MiB asset budget")
    report = {"sourceArchive": archive.name, "sourceArchiveSha256": SOURCE_SHA256,
              "sourceBanks": len(members), "sourceSF2Bytes": sum(len(v) for v in members.values()),
              "includedBanks": len(library.banks), "omittedBanks": sorted(set(members) - {b["originalBank"] for b in library.banks}),
              "sourcePresetsIncluded": sum(b["sourcePresets"] for b in library.banks),
              "deduplicatedSourcePresets": len(library.presets) - 1, "authoredPresets": 1,
              "uniqueSamples": len(library.samples), "monoPCM16Bytes": sum(v["frames"] * 2 for v in library.samples.values()),
              "manifestBytes": len(manifest_js.encode()), "sampleJSBytes": len(samples_js.encode()),
              "transformations": library.transformations, "generators": dict(sorted(library.generator_counts.items())),
              "bankHashes": {name: digest(data) for name, data in sorted(members.items())},
              "sampleSources": {key: library.sample_sources[key] for key in library.samples}}
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.js").write_text(manifest_js, encoding="utf-8")
    (output / "samples.js").write_text(samples_js, encoding="utf-8")
    (output / "provenance.json").write_text(json.dumps(report, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key not in ("sampleSources", "bankHashes", "generators", "omittedBanks")}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Original verified Animal_Crossing_City_Folk.zip")
    parser.add_argument("--output", type=Path, default=ROOT / "assets")
    args = parser.parse_args()
    generate(args.source, args.output)


if __name__ == "__main__":
    main()
