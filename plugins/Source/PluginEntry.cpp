#include "PluginProcessor.h"
#include <cstdio>
#include <exception>
#ifndef KITCHEN_PRODUCT_ID
 #error KITCHEN_PRODUCT_ID must select a generated Kitchen product
#endif
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    try {
        const auto root = kitchen::findResourceRoot();
        return new kitchen::PluginProcessor(kitchen::findProduct(kitchen::readManifest(root), KITCHEN_PRODUCT_ID), root);
    } catch (const std::exception& error) {
        std::fprintf(stderr, "Kitchen %s initialization failed: %s\n", KITCHEN_PRODUCT_ID, error.what()); std::fflush(stderr); throw;
    }
}
