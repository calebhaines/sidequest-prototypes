#include <juce_audio_utils/juce_audio_utils.h>
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>

namespace {
juce::var object() { return juce::var(new juce::DynamicObject()); }
void put(juce::var& value, const juce::Identifier& name, const juce::var& property) { value.getDynamicObject()->setProperty(name, property); }
NSString* nsString(const juce::String& value) { return [NSString stringWithUTF8String:value.toRawUTF8()]; }
juce::String string(NSString* value) { return value != nil ? juce::String::fromUTF8([value UTF8String]) : juce::String(); }

// Completion handlers retain this small result, never an editor or application.
// Closing an editor can invalidate its WebKit request at any time.
struct Reply {
    bool complete = false;
    juce::var value;
    juce::String error;
    juce::String operation;
    double requestedAt = juce::Time::getMillisecondCounterHiRes();
};
std::shared_ptr<Reply> evaluate(WKWebView* view, const juce::String& javascript, const juce::String& operation = "evaluate") {
    auto reply = std::make_shared<Reply>();
    reply->operation = operation;
    [view evaluateJavaScript:nsString(javascript) completionHandler:^(id value, NSError* error) {
        @autoreleasepool {
            if (error != nil) reply->error = string([error localizedDescription]);
            else if ([value isKindOfClass:[NSString class]]) reply->value = juce::JSON::parse(string((NSString*) value));
            else reply->error = "WebKit did not return a JSON string";
            reply->complete = true;
        }
    }];
    return reply;
}

void findWebViews(NSView* parent, std::vector<WKWebView*>& found) {
    if ([parent isKindOfClass:[WKWebView class]]) found.push_back((WKWebView*) parent);
    for (NSView* child in [parent subviews]) findWebViews(child, found);
}
std::vector<WKWebView*> webViews(juce::Component& host) {
    std::vector<WKWebView*> found;
    if (auto* peer = host.getPeer()) findWebViews((__bridge NSView*) peer->getNativeHandle(), found);
    return found;
}

std::shared_ptr<Reply> snapshot(WKWebView* view) {
    auto reply = std::make_shared<Reply>();
    reply->operation = "takeSnapshot";
    WKSnapshotConfiguration* configuration = [[WKSnapshotConfiguration alloc] init];
    configuration.rect = [view bounds];
    configuration.snapshotWidth = @256;
    configuration.afterScreenUpdates = YES;
    [view takeSnapshotWithConfiguration:configuration completionHandler:^(NSImage* image, NSError* error) {
        @autoreleasepool {
            if (error != nil) reply->error = string([error localizedDescription]);
            else if (image == nil) reply->error = "WebKit returned no snapshot";
            else {
                CGImageRef nativeImage = [image CGImageForProposedRect:nullptr context:nil hints:nil];
                std::array<unsigned char, 64 * 64 * 4> pixels {};
                CGColorSpaceRef colourSpace = CGColorSpaceCreateDeviceRGB();
                CGContextRef context = CGBitmapContextCreate(pixels.data(), 64, 64, 8, 64 * 4, colourSpace,
                    kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
                if (nativeImage == nullptr || context == nullptr) reply->error = "Could not inspect the WebKit snapshot";
                else {
                    CGContextDrawImage(context, CGRectMake(0, 0, 64, 64), nativeImage);
                    // Exclude both vertical edges so the sticky native toolbar
                    // cannot make an otherwise black original editor pass.
                    int lit = 0;
                    for (int y = 12; y < 52; ++y) for (int x = 0; x < 64; ++x) {
                        const auto at = static_cast<size_t>((y * 64 + x) * 4);
                        if (pixels[at + 3] > 0 && std::max({ pixels[at], pixels[at + 1], pixels[at + 2] }) > 32) ++lit;
                    }
                    reply->value = object();
                    put(reply->value, "width", static_cast<int>(CGImageGetWidth(nativeImage)));
                    put(reply->value, "height", static_cast<int>(CGImageGetHeight(nativeImage)));
                    put(reply->value, "sampleRegion", "central 62.5% of the viewport, excluding the native toolbar");
                    put(reply->value, "nonblackFraction", lit / 2560.0);
                    put(reply->value, "pass", lit >= 13);
                }
                if (context != nullptr) CGContextRelease(context);
                CGColorSpaceRelease(colourSpace);
            }
            reply->complete = true;
        }
    }];
   #if ! __has_feature(objc_arc)
    [configuration release];
   #endif
    return reply;
}

class AudioPump final : private juce::Thread {
public:
    AudioPump(juce::AudioPluginInstance& instance, bool isInstrument)
        : juce::Thread("Kitchen compiled editor audio"), plugin(instance), instrument(isInstrument) { startThread(); }
    ~AudioPump() override { signalThreadShouldExit(); notify(); stopThread(-1); }
private:
    juce::AudioPluginInstance& plugin;
    bool instrument;
    void run() override {
        juce::AudioBuffer<float> audio(juce::jmax(2, plugin.getTotalNumInputChannels(), plugin.getTotalNumOutputChannels()), 128);
        juce::MidiBuffer midi; midi.ensureSize(16384); std::uint64_t frame = 0;
        while (!threadShouldExit()) {
            audio.clear(); midi.clear();
            if (instrument && frame == 0) midi.addEvent(juce::MidiMessage::noteOn(1, 48, .7f), 17);
            if (!instrument) for (int channel = 0; channel < audio.getNumChannels(); ++channel)
                for (int i = 0; i < 128; ++i) audio.setSample(channel, i, static_cast<float>(.03 * std::sin((frame + i) * 220.0 * juce::MathConstants<double>::twoPi / 48000.0)));
            plugin.processBlock(audio, midi); frame += 128; wait(3);
        }
    }
};

// Deliberately no DocumentWindow, content sizing, or resized() forwarding.
// The editor keeps its constructor size through the initial peer attachment.
class EditorHost final : public juce::Component {
public:
    void paint(juce::Graphics& graphics) override { graphics.fillAll(juce::Colours::black); }
};

constexpr auto pageProbe = R"JS((function() {
    window.__KitchenCompiledPageGeneration ||= Date.now().toString(36) + Math.random().toString(36);
    const bridge = window.KitchenNativeEditor, diagnostics = bridge ? bridge.diagnostics : {};
    const descriptor = bridge ? bridge.descriptor : {}, body = document.body;
    const visible = node => {
        if (!node) return false;
        const r = node.getBoundingClientRect(), s = getComputedStyle(node);
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0;
    };
    const controls = Array.from(document.querySelectorAll('input,button,select,canvas,svg')).filter(node => !node.closest('#kitchenNativeBar') && visible(node)).length;
    return JSON.stringify({ bridge: !!bridge, sourceId: String(descriptor.sourceId || descriptor.instrumentId || descriptor.effectId || descriptor.id || '').replace(/^(?:instrument|effect)[:-]/, ''),
        ready: !!diagnostics.ready, hydrated: !!diagnostics.hydrated, diagnostics,
        width: innerWidth, height: innerHeight, bodyVisible: visible(body), originalControlsVisible: controls,
        visibility: document.visibilityState, url: location.href, pageGeneration: window.__KitchenCompiledPageGeneration });
})())JS";

class CompiledUiSmokeApplication final : public juce::JUCEApplication, private juce::Timer {
public:
    const juce::String getApplicationName() override { return "Kitchen compiled VST3 editor smoke"; }
    const juce::String getApplicationVersion() override { return "1.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }
    void initialise(const juce::String& commandLine) override {
        const auto arguments = juce::StringArray::fromTokens(commandLine, true);
        for (int i = 0; i < arguments.size(); ++i) {
            if (arguments[i] == "--resources" && i + 1 < arguments.size()) resources = juce::File(arguments[++i].unquoted());
            else if (arguments[i] == "--bundles" && i + 1 < arguments.size()) bundlesDirectory = juce::File(arguments[++i].unquoted());
            else if (arguments[i] == "--report" && i + 1 < arguments.size()) reportFile = juce::File(arguments[++i].unquoted());
        }
        if (reportFile == juce::File()) reportFile = resources.getChildFile("compiled-ui-smoke-report.json");
        try {
            if (!resources.isDirectory() || !bundlesDirectory.isDirectory()) throw std::runtime_error("Pass --resources with generated resources and --bundles with the VST3 build directory");
            auto manifestFile = resources.getChildFile("products.json");
            if (manifestFile.existsAsFile()) manifest = juce::JSON::parse(manifestFile.loadFileAsString());
            else {
                juce::FileInputStream input(resources.getChildFile("products.json.gz"));
                juce::GZIPDecompressorInputStream decompressed(&input, false, juce::GZIPDecompressorInputStream::gzipFormat);
                manifest = juce::JSON::parse(decompressed.readEntireStreamAsString());
            }
            if (!manifest["products"].isArray()) throw std::runtime_error("Invalid products.json manifest");
            bundlesDirectory.findChildFiles(bundles, juce::File::findDirectories, true, "*.vst3");
            formats.addFormat(std::make_unique<juce::VST3PluginFormat>());
            beginProduct();
            if (plugin != nullptr) startTimerHz(20);
        } catch (const std::exception& error) {
            success = false; initialisationError = error.what(); writeReport(); setApplicationReturnValue(2); quit();
        }
    }
    void shutdown() override { stopTimer(); closeProduct(); }
    void systemRequestedQuit() override { success = false; initialisationError = "Compiled editor smoke was interrupted"; writeReport(); setApplicationReturnValue(1); quit(); }
private:
    enum class Step { detached, ready, smoke, parameter, snapshot, closed, hidden };
    enum class Geometry { initial, reopened, reshown, resized, restored };
    const juce::StringArray ids { "brine", "form", "morsel", "sunday" };
    juce::File resources, bundlesDirectory, reportFile;
    juce::Array<juce::File> bundles;
    juce::AudioPluginFormatManager formats;
    juce::var manifest, row, lastPage, lastFrame, smokeResult, smokeLaunchAck, lastSmokePoll;
    juce::Array<juce::var> rows, checks;
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    std::unique_ptr<EditorHost> host;
    std::unique_ptr<juce::AudioProcessorEditor> editor;
    std::unique_ptr<AudioPump> audio;
    std::shared_ptr<Reply> pending;
    std::vector<std::shared_ptr<Reply>> retiredReplies;
    std::vector<float> parametersBefore;
    juce::String initialisationError, smokePageGeneration, preservedPageGeneration;
    int productIndex = 0, preferredWidth = 0, preferredHeight = 0;
    bool success = true, prepared = false, tickRunning = false;
    Step step = Step::detached;
    Geometry geometry = Geometry::initial;
    double productStarted = 0, stepStarted = 0, lastRequest = 0;

    static double now() { return juce::Time::getMillisecondCounterHiRes(); }
    juce::String geometryName() const {
        switch (geometry) {
            case Geometry::initial: return "initialPreferredSize";
            case Geometry::reopened: return "reopenedPreferredSize";
            case Geometry::reshown: return "reshownSameEditor";
            case Geometry::resized: return "changedSize";
            case Geometry::restored: return "restoredPreferredSize";
        }
        return {};
    }
    juce::String stepName() const {
        switch (step) {
            case Step::detached: return "detached";
            case Step::ready: return "ready";
            case Step::smoke: return "smoke";
            case Step::parameter: return "parameter";
            case Step::snapshot: return "snapshot";
            case Step::closed: return "closed";
            case Step::hidden: return "hidden";
        }
        return {};
    }
    void enter(Step next) { pending.reset(); step = next; stepStarted = now(); lastRequest = 0; }
    void closeProduct() {
        pending.reset(); retiredReplies.clear(); audio.reset(); editor.reset(); host.reset();
        if (plugin && prepared) plugin->releaseResources();
        prepared = false; plugin.reset();
    }
    void beginProduct() {
        closeProduct(); row = object(); checks.clear(); lastPage = lastFrame = smokeResult = smokeLaunchAck = lastSmokePoll = juce::var();
        smokePageGeneration.clear(); preservedPageGeneration.clear();
        put(row, "id", ids[productIndex]); productStarted = now();
        try {
            juce::var descriptor;
            for (const auto& candidate : *manifest["products"].getArray()) if (candidate["id"].toString() == ids[productIndex]) descriptor = candidate;
            if (!descriptor.isObject()) throw std::runtime_error("Representative product is absent from products.json");
            auto bundleId = descriptor["bundleId"].toString();
            if (bundleId.isEmpty()) bundleId = "com.sidequest.kitchen." + ids[productIndex];
            juce::File selected;
            for (const auto& bundle : bundles) {
                NSBundle* candidate = [NSBundle bundleWithPath:nsString(bundle.getFullPathName())];
                if (string([candidate bundleIdentifier]) != bundleId) continue;
                if (selected != juce::File()) throw std::runtime_error("Multiple compiled VST3 bundles have the selected product's bundle identifier");
                selected = bundle;
            }
            if (selected == juce::File()) throw std::runtime_error(("Missing compiled VST3 bundle: " + bundleId).toStdString());
            put(row, "bundle", selected.getFullPathName()); put(row, "bundleId", bundleId);
            juce::OwnedArray<juce::PluginDescription> descriptions;
            formats.getFormat(0)->findAllTypesForFile(descriptions, selected.getFullPathName());
            if (descriptions.size() != 1) throw std::runtime_error("Compiled VST3 did not expose exactly one product");
            put(row, "name", descriptions[0]->name);
            juce::String error; plugin = formats.createPluginInstance(*descriptions[0], 48000, 128, error);
            if (!plugin) throw std::runtime_error(("Could not load compiled VST3: " + error).toStdString());
            plugin->setPlayConfigDetails(descriptions[0]->isInstrument ? 0 : 2, 2, 48000, 128);
            plugin->prepareToPlay(48000, 128); prepared = true;
            audio = std::make_unique<AudioPump>(*plugin, descriptions[0]->isInstrument);
            host = std::make_unique<EditorHost>(); host->setName("Kitchen compiled editor smoke");
            geometry = Geometry::initial; createDetachedEditor();
        } catch (const std::exception& error) { finishProduct(error.what()); }
    }
    void createDetachedEditor() {
        if (host->getPeer() != nullptr) throw std::runtime_error("Editor construction unexpectedly has a desktop peer");
        editor.reset(plugin->createEditorIfNeeded());
        if (!editor || editor->getWidth() <= 0 || editor->getHeight() <= 0) throw std::runtime_error("Compiled VST3 has no editor with a preferred size");
        if (geometry == Geometry::initial) {
            preferredWidth = editor->getWidth(); preferredHeight = editor->getHeight();
            put(row, "preferredWidth", preferredWidth); put(row, "preferredHeight", preferredHeight);
        } else if (editor->getWidth() != preferredWidth || editor->getHeight() != preferredHeight)
            throw std::runtime_error("Reopened editor did not preserve the exact preferred size");
        host->setBounds(20, 40, preferredWidth, preferredHeight);
        host->addAndMakeVisible(*editor);
        host->setVisible(true);
        // Never set the child's bounds here: even an accidental size change can
        // hide a missing constructor-time browser layout in the loaded plugin.
        enter(Step::detached);
    }
    WKWebView* currentWebView() {
        const auto found = webViews(*host);
        if (found.size() > 1) throw std::runtime_error("Host contains multiple WKWebViews, including a stale editor");
        return found.empty() ? nil : found.front();
    }
    bool frameReady(WKWebView* view) {
        if (view == nil) return false;
        const auto bounds = [view bounds], frame = [view frame], visible = [view visibleRect];
        lastFrame = object();
        put(lastFrame, "width", bounds.size.width); put(lastFrame, "height", bounds.size.height);
        put(lastFrame, "frameWidth", frame.size.width); put(lastFrame, "frameHeight", frame.size.height);
        put(lastFrame, "visibleWidth", visible.size.width); put(lastFrame, "visibleHeight", visible.size.height);
        put(lastFrame, "attached", [view window] != nil);
        put(lastFrame, "hidden", static_cast<bool>([view isHiddenOrHasHiddenAncestor]));
        return [view window] != nil && ![view isHiddenOrHasHiddenAncestor]
            && frame.size.width > 0 && frame.size.height > 0 && visible.size.width > 0 && visible.size.height > 0
            && std::abs(bounds.size.width - editor->getWidth()) <= 3 && std::abs(bounds.size.height - editor->getHeight()) <= 3;
    }
    bool pageReady(const juce::var& page) const {
        return static_cast<bool>(page["bridge"]) && page["sourceId"].toString() == ids[productIndex]
            && static_cast<bool>(page["ready"]) && static_cast<bool>(page["hydrated"])
            && static_cast<bool>(page["bodyVisible"]) && static_cast<int>(page["originalControlsVisible"]) > 0
            && static_cast<double>(page["width"]) > 0 && static_cast<double>(page["height"]) > 0
            && std::abs(static_cast<double>(page["width"]) - editor->getWidth()) <= 3
            && std::abs(static_cast<double>(page["height"]) - editor->getHeight()) <= 3;
    }
    void beginSmoke(WKWebView* view) {
        parametersBefore.clear();
        for (auto* parameter : plugin->getParameters()) parametersBefore.push_back(parameter->getValue());
        smokePageGeneration = lastPage["pageGeneration"].toString(); smokeLaunchAck = lastSmokePoll = juce::var();
        enter(Step::smoke);
        pending = evaluate(view, "(function(){const state=window.__KitchenCompiledSmokeState={pageGeneration:window.__KitchenCompiledPageGeneration,phase:'running',startedAt:performance.now()};delete window.__KitchenCompiledSmokeResult;window.KitchenNativeEditor.runSmokeTest().then(function(r){state.phase='completed';state.completedAt=performance.now();window.__KitchenCompiledSmokeResult=r;},function(e){state.phase='rejected';window.__KitchenCompiledSmokeResult={pass:false,error:String(e)};});return JSON.stringify({started:true,state:state});})()", "launchControlSmoke");
    }
    void timerCallback() override {
        // AppKit/plugin creation can run nested message loops while a product
        // transition is in progress. Never advance that transition twice.
        if (tickRunning) return;
        const juce::ScopedValueSetter<bool> guard(tickRunning, true);
        @autoreleasepool {
            try { tick(); }
            catch (const std::exception& error) { finishProduct(error.what()); }
        }
    }
    void tick() {
        if (!editor && step != Step::closed) return;
        // A delayed timer delivery must still consume a final proof that has
        // already completed. Every unresolved phase retains its watchdog.
        const bool finalProofComplete = step == Step::snapshot && geometry == Geometry::restored
            && pending && pending->complete && pending->error.isEmpty() && static_cast<bool>(pending->value["pass"]);
        if (now() - productStarted > 60000 && !finalProofComplete) throw std::runtime_error(("Timed out during " + geometryName() + "/" + stepName()).toStdString());
        if (step == Step::detached) {
            if (editor->getWidth() != preferredWidth || editor->getHeight() != preferredHeight) throw std::runtime_error("Editor size changed before peer attachment");
            if (now() - stepStarted < 250) return;
            host->addToDesktop(juce::ComponentPeer::windowHasTitleBar);
            host->setVisible(true); host->toFront(true); enter(Step::ready); return;
        }
        if (step == Step::closed) {
            if (now() - stepStarted < 250) return;
            if (plugin->getActiveEditor() != nullptr || !webViews(*host).empty()) throw std::runtime_error("Previous compiled editor was not removed from its native host");
            put(row, "previousEditorClosed", true);
            put(row, "staleCallbacksGuarded", true);
            host->removeFromDesktop(); geometry = Geometry::reopened; createDetachedEditor(); return;
        }
        if (step == Step::hidden) {
            if (now() - stepStarted < 250) return;
            host->setVisible(true); host->toFront(true); enter(Step::ready); return;
        }
        WKWebView* view = currentWebView();
        if (step == Step::ready) {
            const int expectedWidth = preferredWidth + (geometry == Geometry::resized ? 83 : 0);
            const int expectedHeight = preferredHeight + (geometry == Geometry::resized ? 57 : 0);
            if (editor->getWidth() != expectedWidth || editor->getHeight() != expectedHeight)
                throw std::runtime_error(("Compiled editor did not retain the requested size during " + geometryName()).toStdString());
            if (!frameReady(view)) return;
            if (!pending) { pending = evaluate(view, pageProbe, "pageProbe"); return; }
            if (!pending->complete) return;
            lastPage = pending->value; pending.reset();
            if (!pageReady(lastPage)) return;
            if (geometry == Geometry::reshown && lastPage["pageGeneration"].toString() != preservedPageGeneration)
                throw std::runtime_error("Hiding and showing the same editor reloaded its WebKit document");
            if (geometry == Geometry::initial || geometry == Geometry::reopened) beginSmoke(view);
            else { enter(Step::snapshot); pending = snapshot(view); }
            return;
        }
        if (view == nil) throw std::runtime_error("WKWebView disappeared during the compiled editor test");
        if (step == Step::smoke) {
            if (pending) {
                if (!pending->complete) return;
                if (pending->error.isNotEmpty()) throw std::runtime_error(pending->error.toStdString());
                if (static_cast<bool>(pending->value["started"])) smokeLaunchAck = pending->value;
                else {
                    lastSmokePoll = pending->value;
                    if (lastSmokePoll["pageGeneration"].toString() != smokePageGeneration)
                        throw std::runtime_error("WebKit document reloaded while the original control smoke was pending");
                    if (lastSmokePoll["result"].isObject()) {
                        smokeResult = lastSmokePoll["result"];
                        if (!static_cast<bool>(smokeResult["pass"])) throw std::runtime_error(("Original control smoke failed: " + smokeResult["error"].toString()).toStdString());
                        if (smokeResult["sourceId"].toString() != ids[productIndex]) throw std::runtime_error("Control smoke returned the wrong product");
                        enter(Step::parameter); return;
                    }
                }
                pending.reset();
            }
            pending = evaluate(view, "JSON.stringify({pageGeneration:window.__KitchenCompiledPageGeneration||null,state:window.__KitchenCompiledSmokeState||null,result:window.__KitchenCompiledSmokeResult||null,diagnostics:window.KitchenNativeEditor?window.KitchenNativeEditor.diagnostics:null})", "pollControlSmoke"); return;
        }
        if (step == Step::parameter) {
            const auto parameter = smokeResult["parameter"];
            const int index = parameter["index"]; const double expected = parameter["normalizedAfter"];
            const auto& parameters = plugin->getParameters();
            if (parameter["index"].isVoid() || parameter["normalizedAfter"].isVoid() || index < 0 || index >= parameters.size()
                || !std::isfinite(expected) || expected < 0 || expected > 1) throw std::runtime_error("Control smoke returned an invalid host parameter");
            const float actual = parameters[index]->getValue();
            if (std::abs(actual - expected) > .002 || std::abs(actual - parametersBefore[static_cast<size_t>(index)]) < 1.0e-6) {
                if (now() - stepStarted > 3000) throw std::runtime_error("Original WebKit control edit did not change the actual compiled host parameter");
                return;
            }
            put(smokeResult, "nativeParameterRoundTrip", true); put(smokeResult, "hostNormalizedBefore", parametersBefore[static_cast<size_t>(index)]); put(smokeResult, "hostNormalizedAfter", actual);
            enter(Step::snapshot); pending = snapshot(view); return;
        }
        if (step == Step::snapshot) {
            if (!pending) { if (now() - lastRequest > 200) { pending = snapshot(view); lastRequest = now(); } return; }
            if (!pending->complete) return;
            if (pending->error.isNotEmpty() || !static_cast<bool>(pending->value["pass"])) {
                if (now() - stepStarted > 8000) throw std::runtime_error(("Compiled editor snapshot is black or unavailable: " + pending->error).toStdString());
                pending.reset(); return;
            }
            auto check = object(); put(check, "phase", geometryName()); put(check, "wkWebView", lastFrame); put(check, "page", lastPage); put(check, "snapshot", pending->value);
            if (geometry == Geometry::initial || geometry == Geometry::reopened) put(check, "controlSmoke", smokeResult);
            put(check, "pass", true); checks.add(check); pending.reset();
            if (geometry == Geometry::initial) {
                // Issue one request immediately before destruction. Its callback
                // can only touch Reply, even if WebKit delivers it after reopen.
                retiredReplies.push_back(evaluate(view, "JSON.stringify({retiredEditor:true})"));
                editor.reset(); enter(Step::closed); return;
            }
            if (geometry == Geometry::reopened) {
                preservedPageGeneration = lastPage["pageGeneration"].toString();
                geometry = Geometry::reshown; host->setVisible(false); enter(Step::hidden); return;
            }
            if (geometry == Geometry::reshown) {
                geometry = Geometry::resized; host->setSize(preferredWidth + 83, preferredHeight + 57);
                editor->setSize(host->getWidth(), host->getHeight()); enter(Step::ready); return;
            }
            if (geometry == Geometry::resized) {
                geometry = Geometry::restored; host->setSize(preferredWidth, preferredHeight);
                editor->setSize(preferredWidth, preferredHeight); enter(Step::ready); return;
            }
            finishProduct({});
        }
    }
    void finishProduct(const juce::String& error) {
        put(row, "passed", error.isEmpty()); put(row, "checks", checks);
        if (error.isNotEmpty()) {
            success = false; put(row, "error", error); put(row, "lastPage", lastPage); put(row, "lastFrame", lastFrame);
            put(row, "phase", geometryName()); put(row, "step", stepName()); put(row, "stepElapsedMs", now() - stepStarted);
            put(row, "smokeLaunchAck", smokeLaunchAck); put(row, "lastSmokePoll", lastSmokePoll); put(row, "smokeResult", smokeResult);
            put(row, "smokePageGeneration", smokePageGeneration); put(row, "preservedPageGeneration", preservedPageGeneration);
            if (pending) {
                auto request = object(); put(request, "operation", pending->operation); put(request, "complete", pending->complete);
                put(request, "ageMs", now() - pending->requestedAt); put(request, "value", pending->value); put(request, "error", pending->error);
                put(row, "pending", request);
            }
        }
        put(row, "elapsedMs", now() - productStarted);
        int completedRetiredReplies = 0; for (const auto& reply : retiredReplies) if (reply->complete) ++completedRetiredReplies;
        put(row, "retiredCallbacksCompleted", completedRetiredReplies);
        rows.add(row); std::cout << juce::JSON::toString(row, true).toStdString() << std::endl; closeProduct();
        if (++productIndex < ids.size()) { beginProduct(); return; }
        stopTimer(); writeReport(); setApplicationReturnValue(success ? 0 : 1); quit();
    }
    void writeReport() {
        auto report = object(); put(report, "passed", success); put(report, "products", rows);
        put(report, "test", "compiled-vst3-webkit-editor");
        if (initialisationError.isNotEmpty()) put(report, "error", initialisationError);
        reportFile.getParentDirectory().createDirectory();
        if (!reportFile.replaceWithText(juce::JSON::toString(report, false))) std::cerr << "Could not write compiled editor report\n";
    }
};
}
START_JUCE_APPLICATION(CompiledUiSmokeApplication)
