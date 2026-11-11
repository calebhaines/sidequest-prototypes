#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <limits>
#include <cstring>

namespace kitchen {
namespace {
float defaultNormalized(const juce::var& p) {
    if (!p["defaultNormalized"].isVoid()) return juce::jlimit(0.0f, 1.0f, static_cast<float>(p["defaultNormalized"]));
    const double lo = p["min"], hi = p["max"], value = p["default"];
    return hi > lo ? static_cast<float>(juce::jlimit(0.0, 1.0, (value - lo) / (hi - lo))) : 0.0f;
}
const juce::Array<juce::var>* choices(const juce::var& p) { if (auto* a = p["options"].getArray()) return a; return p["choices"].getArray(); }
juce::var optionValue(const juce::var& option) { return option.isObject() ? option["value"] : option; }
juce::String optionLabel(const juce::var& option) { return option.isObject() ? option["label"].toString() : option.toString(); }
juce::String parameterText(const juce::var& p, float normalized) {
    if (auto* values = choices(p); values != nullptr && !values->isEmpty()) return optionLabel((*values)[juce::jlimit(0, values->size() - 1, static_cast<int>(std::round(normalized * (values->size() - 1))))]);
    const double lo = p["min"], hi = p["max"], value = lo + normalized * (hi - lo);
    return juce::String(value, 3) + (p["unit"].toString().isEmpty() ? "" : " " + p["unit"].toString());
}
float normalizedValue(const juce::var& p, const juce::var& value) {
    if (auto* values = choices(p); values != nullptr && values->size() > 1) {
        for (int i = 0; i < values->size(); ++i) if (optionValue((*values)[i]) == value || optionValue((*values)[i]).toString() == value.toString() || optionLabel((*values)[i]) == value.toString()) return static_cast<float>(i) / (values->size() - 1);
        return defaultNormalized(p);
    }
    if (value.isBool()) return static_cast<bool>(value) ? 1.0f : 0.0f;
    const double lo = p["min"], hi = p["max"], physical = value.isString() ? value.toString().getDoubleValue() : static_cast<double>(value);
    return hi > lo ? static_cast<float>(juce::jlimit(0.0, 1.0, (physical - lo) / (hi - lo))) : defaultNormalized(p);
}
juce::var atPath(juce::var value, const juce::var& path) {
    juce::Array<juce::var> parts;
    if (auto* a = path.getArray()) parts = *a;
    else for (const auto& s : juce::StringArray::fromTokens(path.toString().replace("[", ".").replace("]", ""), ".", "")) parts.add(s);
    if (parts.isEmpty()) return {};
    for (const auto& part : parts) {
        if (auto* a = value.getArray()) { const int i = part.toString().getIntValue(); if (i < 0 || i >= a->size()) return {}; value = (*a)[i]; }
        else if (auto* object = value.getDynamicObject()) { const auto key = juce::Identifier(part.toString()); if (!object->hasProperty(key)) return {}; value = object->getProperty(key); }
        else return {};
    }
    return value;
}
}
PluginProcessor::PluginProcessor(Product p, juce::File root)
    : AudioProcessor(p.instrument() ? BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)
                                   : BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true).withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      juce::Thread("Kitchen preset preparation"), product(std::move(p)), resources(std::move(root)), metadata(product.parameters()) {
    cachedState = juce::JSON::toString(product.descriptor["defaultState"], true);
    for (int i = 0; i < metadata.size() && i < maxParameters; ++i) {
        const auto pmeta = metadata[i]; auto id = pmeta["id"].toString(); if (id.isEmpty()) id = "parameter-" + juce::String(i);
        auto name = pmeta["name"].toString(); if (name.isEmpty()) name = pmeta["label"].toString(); if (name.isEmpty()) name = id;
        float interval = 0;
        if (auto* values = choices(pmeta); values && values->size() > 1) interval = 1.0f / (values->size() - 1);
        else if (pmeta["type"].toString() == "boolean") interval = 1;
        auto attributes = juce::AudioParameterFloatAttributes().withStringFromValueFunction([pmeta](float value, int) { return parameterText(pmeta, value); })
            .withValueFromStringFunction([pmeta](const juce::String& value) { return normalizedValue(pmeta, juce::var(value)); });
        auto* parameter = new juce::AudioParameterFloat(juce::ParameterID(id, 1), name, juce::NormalisableRange<float>(0, 1, interval), defaultNormalized(pmeta), attributes);
        addParameter(parameter); hostParameters.push_back(parameter);
    }
    lastParameters.assign(hostParameters.size(), std::numeric_limits<float>::quiet_NaN());
    for (auto& value : displayClock) value.store(0);
    displayClock[tempo].store(120); displayClock[numerator].store(4); displayClock[denominator].store(4);
    outputMidi.ensureSize(256 * 1024);
    setLatencySamples(juce::jmax(0, static_cast<int>(product.descriptor["latencySamples"])));
    status = "Waiting for the audio engine";
}
PluginProcessor::~PluginProcessor() {
    signalThreadShouldExit(); notify(); stopThread(-1);
    delete pending.exchange(nullptr); delete current; current = nullptr; drainGarbage();
}
bool PluginProcessor::isBusesLayoutSupported(const BusesLayout& layout) const {
    if (layout.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) return false;
    return product.instrument() || layout.getMainInputChannelSet() == juce::AudioChannelSet::stereo() || layout.getMainInputChannelSet() == juce::AudioChannelSet::mono();
}
void PluginProcessor::prepareToPlay(double sampleRate, int blockSize) {
    rate.store(sampleRate); maxBlock.store(juce::jlimit(128, 65536, blockSize)); clockTracker.reset(); heldCount.fill(0);
    signalThreadShouldExit(); notify(); stopThread(-1); drainGarbage(); delete pending.exchange(nullptr); delete current; current = nullptr;
    ++requestVersion; rebuildSynchronously(); startThread();
}
void PluginProcessor::releaseResources() { resetRequested.store(true); }
void PluginProcessor::reset() { resetRequested.store(true); }
void PluginProcessor::rebuildSynchronously() {
    const auto version = requestVersion.load();
    juce::String state; { const juce::ScopedLock lock(stateLock); state = cachedState; }
    auto next = std::make_unique<NativeRuntime>(product, resources, rate.load(), maxBlock.load(), state, this, retireThunk);
    std::vector<float> initialParameters; for (auto* parameter : hostParameters) initialParameters.push_back(parameter->getValue());
    next->prepareParameters(initialParameters);
    if (!next->ready()) { const juce::ScopedLock lock(stateLock); status = next->getError(); readyFlag.store(false); builtVersion = version; return; }
    setLatencySamples(next->latency()); current = next.release(); readyFlag.store(true); runtimeFault.store(false);
    std::fill(lastParameters.begin(), lastParameters.end(), std::numeric_limits<float>::quiet_NaN()); builtVersion = version;
    const juce::ScopedLock lock(stateLock); status = "Ready";
}
void PluginProcessor::requestRebuild() { ++requestVersion; notify(); }
void PluginProcessor::run() {
    while (!threadShouldExit()) {
        drainGarbage();
        if (appliedFlag.exchange(false)) { const juce::ScopedLock lock(stateLock); status = "Ready"; }
        const auto version = requestVersion.load();
        if (version != builtVersion) {
            juce::String state; { const juce::ScopedLock lock(stateLock); state = cachedState; status = "Preparing the saved sound"; }
            auto next = std::make_unique<NativeRuntime>(product, resources, rate.load(), maxBlock.load(), state, this, retireThunk);
            std::vector<float> initialParameters; for (auto* parameter : hostParameters) initialParameters.push_back(parameter->getValue());
            next->prepareParameters(initialParameters);
            if (version == requestVersion.load() && !threadShouldExit()) {
                builtVersion = version;
                if (next->ready()) { delete pending.exchange(next.release()); const juce::ScopedLock lock(stateLock); status = "Prepared; waiting for the next audio block"; }
                else { const juce::ScopedLock lock(stateLock); status = next->getError(); }
            }
        }
        wait(20);
    }
    drainGarbage();
}
bool PluginProcessor::retireThunk(void* owner, void* value, void (*destroy)(void*)) { return static_cast<PluginProcessor*>(owner)->retire(value, destroy); }
bool PluginProcessor::retire(void* pointer, void (*destroy)(void*)) noexcept {
    int first, count, second, remaining; garbageFifo.prepareToWrite(1, first, count, second, remaining);
    if (count == 0) return false;
    garbage[static_cast<size_t>(first)] = { pointer, destroy }; garbageFifo.finishedWrite(1); return true;
}
void PluginProcessor::drainGarbage() {
    int first, count, second, remaining; garbageFifo.prepareToRead(1024, first, count, second, remaining);
    for (int i = 0; i < count; ++i) { auto& value = garbage[static_cast<size_t>(first + i)]; if (value.pointer) value.destroy(value.pointer); value = {}; }
    for (int i = 0; i < remaining; ++i) { auto& value = garbage[static_cast<size_t>(second + i)]; if (value.pointer) value.destroy(value.pointer); value = {}; }
    garbageFifo.finishedRead(count + remaining);
}
void PluginProcessor::readHostClock(std::array<double, clockFields>& c, int count) {
    c.fill(0); c[tempo] = 120; c[numerator] = c[denominator] = 4;
    if (auto* playHead = getPlayHead()) if (auto position = playHead->getPosition()) {
        if (auto value = position->getBpm(); value && std::isfinite(*value) && *value > 0) c[tempo] = *value;
        if (auto value = position->getPpqPosition()) { c[ppq] = *value; c[validPpq] = 1; }
        if (auto value = position->getTimeInSamples()) { c[hostSample] = static_cast<double>(*value); c[validHostSample] = 1; }
        if (auto value = position->getTimeSignature()) { c[numerator] = value->numerator; c[denominator] = value->denominator; }
        if (auto value = position->getLoopPoints()) { c[loopStart] = value->ppqStart; c[loopEnd] = value->ppqEnd; }
        c[playing] = position->getIsPlaying() ? 1 : 0; c[looping] = position->getIsLooping() ? 1 : 0; c[recording] = position->getIsRecording() ? 1 : 0;
    }
    clockTracker.begin(c, rate.load(), count);
    for (int i = 0; i < clockFields; ++i) displayClock[static_cast<size_t>(i)].store(c[static_cast<size_t>(i)]);
}
std::uint32_t PluginProcessor::midiId(int pitch, int channel, bool on) noexcept {
    const int key = juce::jlimit(0, 15, channel - 1) * 128 + juce::jlimit(0, 127, pitch); auto& count = heldCount[static_cast<size_t>(key)]; auto& ids = heldIds[static_cast<size_t>(key)];
    if (on) { if (count == static_cast<int>(ids.size())) { for (int i = 1; i < count; ++i) ids[static_cast<size_t>(i - 1)] = ids[static_cast<size_t>(i)]; --count; } const auto id = ++noteSerial; ids[static_cast<size_t>(count++)] = id; return id; }
    if (count == 0) return 0; const auto id = ids[0]; for (int i = 1; i < count; ++i) ids[static_cast<size_t>(i - 1)] = ids[static_cast<size_t>(i)]; --count; return id;
}
void PluginProcessor::addEvent(NativeRuntime& runtime, int offset, int type, int first, double second, int channel) noexcept {
    auto& count = runtime.midiCount();
    if (count >= maxEvents - 1) { auto* row = runtime.midi() + (maxEvents - 1) * eventFields; std::fill(row, row + eventFields, 0); row[0] = offset; row[1] = allNotesOff; count = maxEvents; heldCount.fill(0); return; }
    auto* row = runtime.midi() + count++ * eventFields;
    writeMidiRow(row, offset, type, first, second, channel, type == noteOn || type == noteOff ? midiId(first, channel, type == noteOn) : 0);
    if (type == allNotesOff) heldCount.fill(0);
}
void PluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;
    if (auto* next = pending.load(); next && (current == nullptr || garbageFifo.getFreeSpace() > 0)) {
        next = pending.exchange(nullptr);
        if (next) { auto* previous = current; current = next; if (previous) retire(previous, NativeRuntime::destroy); std::fill(lastParameters.begin(), lastParameters.end(), std::numeric_limits<float>::quiet_NaN()); readyFlag.store(true); runtimeFault.store(false); appliedFlag.store(true); }
    }
    if (current == nullptr || !current->ready()) { buffer.clear(); midiMessages.clear(); readyFlag.store(false); return; }
    if (resetRequested.exchange(false)) { current->reset(); heldCount.fill(0); clockTracker.reset(); }
    for (size_t i = 0; i < hostParameters.size(); ++i) { const float value = hostParameters[i]->getValue(); if (value != current->appliedParameter(static_cast<int>(i))) { current->parameter(static_cast<int>(i), value, true); lastParameters[i] = value; } }
    std::array<double, clockFields> c{}; const int total = buffer.getNumSamples(); readHostClock(c, total); outputMidi.clear();
    for (int offset = 0; offset < total;) {
        const int count = juce::jmin(current->capacity(), total - offset);
        for (int i = 0; i < clockFields; ++i) current->clock()[i] = c[static_cast<size_t>(i)];
        current->clock()[frames] = count; current->clock()[localFrame] = static_cast<double>(clockTracker.local + static_cast<std::uint64_t>(offset));
        if (c[validPpq] && c[playing]) current->clock()[ppq] += offset * c[tempo] / (60.0 * rate.load());
        if (c[validHostSample]) current->clock()[hostSample] += offset;
        if (product.instrument()) { std::fill(current->input(0), current->input(0) + count, 0); std::fill(current->input(1), current->input(1) + count, 0); }
        else { const int inputChannels = getTotalNumInputChannels(); for (int ch = 0; ch < 2; ++ch) { if (inputChannels > 0) std::memcpy(current->input(ch), buffer.getReadPointer(juce::jmin(ch, inputChannels - 1), offset), static_cast<size_t>(count) * sizeof(float)); else std::fill(current->input(ch), current->input(ch) + count, 0); } }
        current->setMidiCount(0);
        for (const auto event : midiMessages) {
            if (event.samplePosition < offset || event.samplePosition >= offset + count) continue;
            const auto message = event.getMessage(); const int at = event.samplePosition - offset;
            if (message.isNoteOn()) addEvent(*current, at, noteOn, message.getNoteNumber(), message.getFloatVelocity(), message.getChannel());
            else if (message.isNoteOff()) addEvent(*current, at, noteOff, message.getNoteNumber(), message.getFloatVelocity(), message.getChannel());
            else if (message.isController()) addEvent(*current, at, message.isAllNotesOff() || message.isAllSoundOff() ? allNotesOff : controller, message.getControllerNumber(), message.getControllerValue() / 127.0, message.getChannel());
            else if (message.isPitchWheel()) addEvent(*current, at, pitchBend, 0, (message.getPitchWheelValue() - 8192) / 8192.0, message.getChannel());
        }
        if (offset == 0) { int first, n, second, other; uiMidiFifo.prepareToRead(1024, first, n, second, other); for (int i = 0; i < n + other; ++i) { const auto& e = uiMidi[static_cast<size_t>(i < n ? first + i : second + i - n)]; addEvent(*current, 0, e.type, e.data1, e.data2, e.channel); } uiMidiFifo.finishedRead(n + other); }
        current->process(count);
        for (int ch = 0; ch < juce::jmin(2, buffer.getNumChannels()); ++ch) std::memcpy(buffer.getWritePointer(ch, offset), current->output(ch), static_cast<size_t>(count) * sizeof(float));
        if (producesMidi()) for (int i = 0; i < current->midiOutputCount(); ++i) { const auto* e = current->midiOutput() + i * eventFields; const int at = offset + juce::jlimit(0, count - 1, static_cast<int>(e[0])), channel = juce::jlimit(1, 16, static_cast<int>(e[4])); if (e[1] == noteOn) outputMidi.addEvent(juce::MidiMessage::noteOn(channel, juce::jlimit(0, 127, static_cast<int>(e[2])), static_cast<float>(juce::jlimit(0.0, 1.0, e[3]))), at); else if (e[1] == noteOff) outputMidi.addEvent(juce::MidiMessage::noteOff(channel, juce::jlimit(0, 127, static_cast<int>(e[2]))), at); }
        offset += count;
    }
    clockTracker.advance(total); midiMessages.swapWith(outputMidi);
    if (!current->ready()) { readyFlag.store(false); runtimeFault.store(true); }
}
void PluginProcessor::synchronizeParametersFromState(const juce::var& state) {
    for (int i = 0; i < metadata.size() && i < static_cast<int>(hostParameters.size()); ++i) {
        auto value = atPath(state, metadata[i]["path"]);
        if (value.isVoid() && state["state"].isObject()) value = atPath(state["state"], metadata[i]["path"]);
        if (!value.isVoid()) hostParameters[static_cast<size_t>(i)]->setValueNotifyingHost(normalizedValue(metadata[i], value));
    }
}
void PluginProcessor::stateFromEditor(const juce::var& payload) {
    auto state = payload["state"]; if (state.isString()) state = juce::JSON::parse(state.toString()); if (!state.isObject()) return;
    const auto json = juce::JSON::toString(state, true); if (json.getNumBytesAsUTF8() > 448 * 1024 * 1024) return;
    synchronizeParametersFromState(state);
    { const juce::ScopedLock lock(stateLock); if (cachedState == json) return; cachedState = json; }
    requestRebuild();
}
void PluginProcessor::parameterFromEditor(const juce::var& payload) {
    int index = payload["index"].isVoid() ? -1 : static_cast<int>(payload["index"]);
    if (index < 0 && !payload["path"].isVoid()) for (int i = 0; i < metadata.size(); ++i) if (metadata[i]["path"] == payload["path"] || metadata[i]["path"].toString() == payload["path"].toString()) { index = i; break; }
    if (index < 0 || index >= static_cast<int>(hostParameters.size())) return;
    const float value = payload["normalized"].isVoid() ? normalizedValue(metadata[index], payload["value"]) : juce::jlimit(0.0f, 1.0f, static_cast<float>(payload["normalized"]));
    auto* parameter = hostParameters[static_cast<size_t>(index)]; parameter->beginChangeGesture(); parameter->setValueNotifyingHost(value); parameter->endChangeGesture();
}
void PluginProcessor::midiFromEditor(const juce::var& payload) {
    UiMidi event; const auto type = payload["type"].toString(); event.type = type == "on" || type == "noteOn" ? noteOn : type == "off" || type == "noteOff" ? noteOff : type == "cc" ? controller : type == "bend" ? pitchBend : allNotesOff;
    event.channel = juce::jlimit(1, 16, payload["channel"].isVoid() ? 1 : static_cast<int>(payload["channel"])); event.data1 = event.type == controller ? static_cast<int>(payload["controller"]) : static_cast<int>(payload["pitch"]);
    event.data2 = event.type == controller || event.type == pitchBend ? static_cast<double>(payload["value"]) : payload["velocity"].isVoid() ? .8 : static_cast<double>(payload["velocity"]);
    int first, count, second, remaining; uiMidiFifo.prepareToWrite(1, first, count, second, remaining); if (count) { uiMidi[static_cast<size_t>(first)] = event; uiMidiFifo.finishedWrite(1); }
}
void PluginProcessor::getStateInformation(juce::MemoryBlock& dest) {
    auto* object = new juce::DynamicObject(); object->setProperty("format", "kitchen-vst3-state"); object->setProperty("version", 1); object->setProperty("product", product.id);
    { const juce::ScopedLock lock(stateLock); object->setProperty("state", cachedState); }
    juce::Array<juce::var> values; for (auto* parameter : hostParameters) values.add(parameter->getValue()); object->setProperty("parameters", values);
    const auto json = juce::JSON::toString(juce::var(object), true); dest.replaceAll(json.toRawUTF8(), json.getNumBytesAsUTF8());
}
void PluginProcessor::setStateInformation(const void* data, int size) {
    if (data == nullptr || size <= 0 || size > 448 * 1024 * 1024) return;
    auto value = juce::JSON::parse(juce::String::fromUTF8(static_cast<const char*>(data), size));
    if (value["format"].toString() != "kitchen-vst3-state" || value["product"].toString() != product.id) return;
    { const juce::ScopedLock lock(stateLock); cachedState = value["state"].toString(); }
    if (auto* values = value["parameters"].getArray()) for (int i = 0; i < values->size() && i < static_cast<int>(hostParameters.size()); ++i) hostParameters[static_cast<size_t>(i)]->setValueNotifyingHost(juce::jlimit(0.0f, 1.0f, static_cast<float>((*values)[i])));
    requestRebuild();
}
juce::var PluginProcessor::editorSnapshot() {
    auto* object = new juce::DynamicObject(); object->setProperty("descriptor", product.descriptor);
    { const juce::ScopedLock lock(stateLock); object->setProperty("state", juce::JSON::parse(cachedState)); }
    juce::Array<juce::var> values; for (auto* parameter : hostParameters) values.add(parameter->getValue()); object->setProperty("parameters", values); object->setProperty("status", statusMessage()); object->setProperty("ready", isReady()); return juce::var(object);
}
juce::var PluginProcessor::parameterSnapshot() const { juce::Array<juce::var> values; for (auto* parameter : hostParameters) values.add(parameter->getValue()); return values; }
juce::var PluginProcessor::editorClock() const {
    auto* object = new juce::DynamicObject(); const char* names[] = { "tempo", "beat", "playing", "numerator", "denominator", "looping", "loopStart", "loopEnd", "samplePosition", "localFrame", "revision", "sampleRate", "frames", "recording", "validPpq", "validHostSample" };
    for (int i = 0; i < clockFields; ++i) object->setProperty(names[i], displayClock[static_cast<size_t>(i)].load()); return juce::var(object);
}
juce::String PluginProcessor::statusMessage() { if (runtimeFault.load()) return "Audio processing stopped after a DSP error. Reload the saved sound."; const juce::ScopedLock lock(stateLock); return status; }
juce::AudioProcessorEditor* PluginProcessor::createEditor() { return new PluginEditor(*this); }
}
