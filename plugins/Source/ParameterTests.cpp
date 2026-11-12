#include "PluginProcessor.h"
#include <iostream>
#include <stdexcept>
#include <cmath>

namespace {
void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
bool near(float a, float b) { return std::abs(a - b) < 1.0e-6f; }
}
int main() {
    juce::ScopedJuceInitialiser_GUI initialiser;
    try {
        auto descriptor = juce::JSON::parse(R"JSON({"id":"parameter-test","name":"Parameter test","kind":"effect","defaultState":{},"parameters":[{"id":"wave","path":"params.wave","name":"Wave","type":"select","defaultNormalized":0,"options":[{"value":"sine","label":"Sine"},{"value":"saw","label":"Saw"},{"value":"pulse","label":"Pulse"}]},{"id":"enabled","path":"params.enabled","name":"Enabled","type":"boolean","min":0,"max":1,"defaultNormalized":1},{"id":"gain","path":"params.gain","name":"Gain","type":"number","min":0,"max":1,"defaultNormalized":0.3}]})JSON");
        kitchen::Product product { "parameter-test", "Parameter test", "effect", descriptor };
        kitchen::PluginProcessor processor(product); const auto& parameters = processor.getParameters();
        require(parameters.size() == 3, "Expected choice, toggle and numeric parameters");
        require(parameters[0]->isDiscrete() && !parameters[0]->isBoolean() && parameters[0]->getNumSteps() == 3, "Choice must advertise its actual three steps");
        require(parameters[1]->isDiscrete() && parameters[1]->isBoolean() && parameters[1]->getNumSteps() == 2, "Toggle must advertise boolean metadata");
        require(!parameters[2]->isDiscrete() && !parameters[2]->isBoolean() && parameters[2]->getNumSteps() > 128, "Numeric control must remain continuous");
        parameters[0]->setValueNotifyingHost(.61f); parameters[1]->setValueNotifyingHost(.61f); parameters[2]->setValueNotifyingHost(.61f);
        require(near(parameters[0]->getValue(), .5f), "Choice must snap to its legal normalized value");
        require(near(parameters[1]->getValue(), 1), "Toggle must snap to on"); require(near(parameters[2]->getValue(), .61f), "Numeric control must preserve 0.61");
        juce::MemoryBlock state; processor.getStateInformation(state);
        auto reordered = descriptor.clone(); const auto original = *descriptor["parameters"].getArray(); juce::Array<juce::var> order { original[2], original[0], original[1] }; reordered.getDynamicObject()->setProperty("parameters", order);
        kitchen::PluginProcessor restored({ "parameter-test", "Parameter test", "effect", reordered }); restored.setStateInformation(state.getData(), static_cast<int>(state.getSize())); const auto& result = restored.getParameters();
        require(near(result[0]->getValue(), .61f) && near(result[1]->getValue(), .5f) && near(result[2]->getValue(), 1), "Stable-ID state must restore gain and snapped enums after parameter reordering");
        std::cout << "PASS host parameter choice/toggle metadata, quantization and stable-ID state restoration\n";
    } catch (const std::exception& error) { std::cerr << error.what() << std::endl; return 1; }
    return 0;
}
