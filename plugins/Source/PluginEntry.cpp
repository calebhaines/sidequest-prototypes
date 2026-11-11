#include "PluginProcessor.h"
#ifndef KITCHEN_PRODUCT_ID
 #error KITCHEN_PRODUCT_ID must select a generated Kitchen product
#endif
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    const auto root = kitchen::findResourceRoot();
    return new kitchen::PluginProcessor(kitchen::findProduct(kitchen::readManifest(root), KITCHEN_PRODUCT_ID), root);
}
