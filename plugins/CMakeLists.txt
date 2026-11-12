cmake_minimum_required(VERSION 3.22)
if(CMAKE_HOST_APPLE)
    if(NOT DEFINED CMAKE_OSX_DEPLOYMENT_TARGET)
        set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum supported macOS")
    endif()
    if(NOT DEFINED CMAKE_OSX_ARCHITECTURES)
        set(CMAKE_OSX_ARCHITECTURES arm64 CACHE STRING "Native Apple Silicon target")
    endif()
endif()
project(KitchenPlugins VERSION 1.0.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
option(KITCHEN_BUILD_AU "Also build Audio Units for Logic" ON)
option(KITCHEN_BUILD_PLUGINS "Build every generated plugin target" ON)
set(KITCHEN_GENERATED "${CMAKE_CURRENT_SOURCE_DIR}/generated" CACHE PATH "Generated runtime, manifest and editors")
set(KITCHEN_PRODUCTS "" CACHE STRING "Optional semicolon-separated product IDs to build")
add_executable(kitchen_clock_tests Source/ClockTests.cpp)
enable_testing()
add_test(NAME kitchen_native_clock COMMAND kitchen_clock_tests)
if(NOT APPLE)
    message(STATUS "Apple plugin binaries require macOS. Building portable host-clock tests only.")
    return()
endif()
function(kitchen_sign_jit_test target)
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND /usr/bin/codesign --force --sign - --entitlements "${CMAKE_CURRENT_SOURCE_DIR}/platform/Jit.entitlements" "$<TARGET_FILE:${target}>"
        VERBATIM)
endfunction()
add_executable(kitchen_jsc_probe Source/JSCProbe.cpp)
target_link_libraries(kitchen_jsc_probe PRIVATE "-framework JavaScriptCore")
kitchen_sign_jit_test(kitchen_jsc_probe)
add_test(NAME kitchen_jsc_capabilities COMMAND kitchen_jsc_probe)
if(NOT EXISTS "${KITCHEN_GENERATED}/products.cmake" OR NOT EXISTS "${KITCHEN_GENERATED}/runtime.js")
    message(FATAL_ERROR "Generate the Kitchen runtime/resources before configuring: npm run plugins:generate")
endif()
include(FetchContent)
FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.12 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)
# Every product uses the same module implementations in KitchenNativeCore.
# JUCE's client interface normally imports the processor module sources into
# each product as well; retain the client headers/wrappers and remove just that
# implementation dependency, avoiding 42 copies of the framework compilation.
get_target_property(kitchen_client_links juce_audio_plugin_client INTERFACE_LINK_LIBRARIES)
list(REMOVE_ITEM kitchen_client_links juce_audio_processors juce::juce_audio_processors)
list(APPEND kitchen_client_links juce_vst3_headers)
set_property(TARGET juce_audio_plugin_client PROPERTY INTERFACE_LINK_LIBRARIES "${kitchen_client_links}")
# JUCE also lists every inactive wrapper format on each client interface.
# Compile only the chosen Apple formats, keeping any headers/shared utility
# source in that interface. AU has two deliberate translation units.
foreach(kitchen_format IN ITEMS VST3 AU)
    get_target_property(kitchen_wrapper_sources juce_audio_plugin_client_${kitchen_format} INTERFACE_SOURCES)
    set(kitchen_selected_sources)
    foreach(kitchen_source IN LISTS kitchen_wrapper_sources)
        if(kitchen_source MATCHES "\\.(h|hpp|hxx)(>|$)" OR kitchen_source MATCHES "/juce_audio_plugin_client_utils\\.(cpp|mm)(>|$)")
            list(APPEND kitchen_selected_sources "${kitchen_source}")
        elseif(kitchen_format STREQUAL "VST3" AND kitchen_source MATCHES "/juce_audio_plugin_client_VST3\\.(cpp|mm)(>|$)")
            list(APPEND kitchen_selected_sources "${kitchen_source}")
        elseif(kitchen_format STREQUAL "AU" AND kitchen_source MATCHES "/juce_audio_plugin_client_AU_[12]\\.mm(>|$)")
            list(APPEND kitchen_selected_sources "${kitchen_source}")
        endif()
    endforeach()
    set_property(TARGET juce_audio_plugin_client_${kitchen_format} PROPERTY INTERFACE_SOURCES "${kitchen_selected_sources}")
endforeach()
add_library(KitchenNativeCore STATIC Source/NativeRuntime.cpp Source/NativeRemoteRuntime.cpp Source/PluginProcessor.cpp Source/PluginEditor.cpp)
set_target_properties(KitchenNativeCore PROPERTIES CXX_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN YES)
target_include_directories(KitchenNativeCore PUBLIC Source "${juce_SOURCE_DIR}/modules")
target_compile_definitions(KitchenNativeCore PUBLIC
    JUCE_WEB_BROWSER=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0 JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 JUCE_PLUGINHOST_VST3=1
    JUCE_DISPLAY_SPLASH_SCREEN=0 JUCE_REPORT_APP_USAGE=0
    JUCE_MODULE_AVAILABLE_juce_audio_utils=1 JUCE_MODULE_AVAILABLE_juce_audio_processors=1
    JUCE_MODULE_AVAILABLE_juce_audio_processors_headless=1
    JUCE_MODULE_AVAILABLE_juce_audio_basics=1 JUCE_MODULE_AVAILABLE_juce_audio_devices=1
    JUCE_MODULE_AVAILABLE_juce_audio_formats=1 JUCE_MODULE_AVAILABLE_juce_gui_extra=1
    JUCE_MODULE_AVAILABLE_juce_gui_basics=1 JUCE_MODULE_AVAILABLE_juce_graphics=1
    JUCE_MODULE_AVAILABLE_juce_events=1 JUCE_MODULE_AVAILABLE_juce_core=1
    JUCE_MODULE_AVAILABLE_juce_data_structures=1 JUCE_MODULE_AVAILABLE_juce_dsp=1)
target_link_libraries(KitchenNativeCore PRIVATE
    juce::juce_audio_utils juce::juce_gui_extra juce::juce_dsp
    juce::juce_recommended_config_flags juce::juce_recommended_warning_flags
    "-framework JavaScriptCore")
# This target contains SDK headers/definitions only, so wrappers retain VST3
# include paths without re-importing any JUCE implementation sources.
target_link_libraries(KitchenNativeCore PUBLIC juce_vst3_headers)
juce_add_console_app(kitchen_dsp_helper PRODUCT_NAME "KitchenDSPHelper")
target_sources(kitchen_dsp_helper PRIVATE Source/DspHelperMain.cpp)
target_link_libraries(kitchen_dsp_helper PRIVATE KitchenNativeCore "-framework JavaScriptCore")
set_target_properties(kitchen_dsp_helper PROPERTIES OUTPUT_NAME KitchenDSPHelper)
add_custom_command(TARGET kitchen_dsp_helper POST_BUILD
    COMMAND /usr/bin/codesign --force --sign - --options runtime --entitlements "${CMAKE_CURRENT_SOURCE_DIR}/platform/DspHelper.entitlements" "$<TARGET_FILE:kitchen_dsp_helper>"
    VERBATIM)
function(kitchen_copy_test_helper target)
    add_dependencies(${target} kitchen_dsp_helper)
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different "$<TARGET_FILE:kitchen_dsp_helper>" "$<TARGET_FILE_DIR:${target}>/KitchenDSPHelper"
        VERBATIM)
endfunction()
juce_add_console_app(kitchen_native_smoke PRODUCT_NAME "Kitchen Native Smoke")
target_sources(kitchen_native_smoke PRIVATE Source/NativeSmoke.cpp)
target_link_libraries(kitchen_native_smoke PRIVATE KitchenNativeCore "-framework JavaScriptCore")
kitchen_sign_jit_test(kitchen_native_smoke)
kitchen_copy_test_helper(kitchen_native_smoke)
juce_add_console_app(kitchen_helper_transport_tests PRODUCT_NAME "Kitchen Helper Transport Tests")
target_sources(kitchen_helper_transport_tests PRIVATE Source/HelperTransportTests.cpp)
target_link_libraries(kitchen_helper_transport_tests PRIVATE KitchenNativeCore "-framework JavaScriptCore")
kitchen_sign_jit_test(kitchen_helper_transport_tests)
kitchen_copy_test_helper(kitchen_helper_transport_tests)
add_test(NAME kitchen_helper_transport COMMAND kitchen_helper_transport_tests --resources "${KITCHEN_GENERATED}")
set_tests_properties(kitchen_helper_transport PROPERTIES TIMEOUT 240)
juce_add_console_app(kitchen_parameter_tests PRODUCT_NAME "Kitchen Parameter Tests")
target_sources(kitchen_parameter_tests PRIVATE Source/ParameterTests.cpp)
target_link_libraries(kitchen_parameter_tests PRIVATE KitchenNativeCore "-framework JavaScriptCore")
add_test(NAME kitchen_parameter_state COMMAND kitchen_parameter_tests)
add_test(NAME kitchen_all_native_audio COMMAND kitchen_native_smoke --resources "${KITCHEN_GENERATED}" --all)
juce_add_console_app(kitchen_vst3_host_smoke PRODUCT_NAME "Kitchen VST3 Host Smoke")
target_sources(kitchen_vst3_host_smoke PRIVATE Source/PluginHostSmoke.cpp)
target_link_libraries(kitchen_vst3_host_smoke PRIVATE KitchenNativeCore "-framework JavaScriptCore")
kitchen_sign_jit_test(kitchen_vst3_host_smoke)
kitchen_copy_test_helper(kitchen_vst3_host_smoke)
juce_add_gui_app(kitchen_native_ui_smoke PRODUCT_NAME "Kitchen Native UI Smoke")
target_sources(kitchen_native_ui_smoke PRIVATE Source/NativeUiSmoke.cpp)
target_link_libraries(kitchen_native_ui_smoke PRIVATE KitchenNativeCore "-framework JavaScriptCore")
kitchen_sign_jit_test(kitchen_native_ui_smoke)
kitchen_copy_test_helper(kitchen_native_ui_smoke)
add_test(NAME kitchen_native_webkit_ui COMMAND kitchen_native_ui_smoke --resources "${KITCHEN_GENERATED}" --report "${KITCHEN_GENERATED}/native-ui-smoke-report.json")
set_tests_properties(kitchen_native_webkit_ui PROPERTIES TIMEOUT 300)
if(KITCHEN_BUILD_PLUGINS)
    add_test(NAME kitchen_compiled_vst3_audio COMMAND kitchen_vst3_host_smoke --bundles "${CMAKE_BINARY_DIR}" --report "${KITCHEN_GENERATED}/native-vst3-host-report.json")
    juce_add_console_app(kitchen_native_sustained_smoke PRODUCT_NAME "Kitchen Native Sustained Smoke")
    target_sources(kitchen_native_sustained_smoke PRIVATE Source/NativeSustainedSmoke.cpp)
    target_link_libraries(kitchen_native_sustained_smoke PRIVATE KitchenNativeCore "-framework JavaScriptCore" "-lproc")
    kitchen_sign_jit_test(kitchen_native_sustained_smoke)
    add_test(NAME kitchen_compiled_vst3_sustained_audio COMMAND kitchen_native_sustained_smoke --bundles "${CMAKE_BINARY_DIR}" --seconds 300 --paced --report "${KITCHEN_GENERATED}/native-sustained-smoke-report.json")
    set_tests_properties(kitchen_compiled_vst3_sustained_audio PROPERTIES TIMEOUT 600)
    juce_add_gui_app(kitchen_compiled_ui_smoke PRODUCT_NAME "Kitchen Compiled UI Smoke")
    set_target_properties(kitchen_compiled_ui_smoke PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED YES)
    target_sources(kitchen_compiled_ui_smoke PRIVATE Source/CompiledUiSmoke.mm)
    target_link_libraries(kitchen_compiled_ui_smoke PRIVATE KitchenNativeCore "-framework JavaScriptCore" "-framework AppKit" "-framework WebKit")
    kitchen_sign_jit_test(kitchen_compiled_ui_smoke)
    add_test(NAME kitchen_compiled_vst3_webkit_ui COMMAND kitchen_compiled_ui_smoke --resources "${KITCHEN_GENERATED}" --bundles "${CMAKE_BINARY_DIR}" --report "${KITCHEN_GENERATED}/native-compiled-ui-smoke-report.json")
    set_tests_properties(kitchen_compiled_vst3_webkit_ui PROPERTIES TIMEOUT 300)
endif()

function(kitchen_add_product id display_name code kind)
    if(NOT KITCHEN_BUILD_PLUGINS)
        return()
    endif()
    if(KITCHEN_PRODUCTS AND NOT id IN_LIST KITCHEN_PRODUCTS)
        return()
    endif()
    set(target "Kitchen_${id}")
    set(bundle_name "${display_name}")
    # Keep the original spelling inside the editor. JUCE's plugin-name macros
    # and Apple's executable signing paths require an ASCII host-facing name.
    if(id STREQUAL "saute")
        set(bundle_name "SAUTE")
    endif()
    set(is_instrument FALSE)
    set(needs_midi FALSE)
    set(midi_output FALSE)
    if(kind STREQUAL "instrument")
        set(is_instrument TRUE)
        set(needs_midi TRUE)
    endif()
    if(is_instrument)
        set(categories Instrument Synth)
    else()
        set(categories Fx)
    endif()
    set(formats VST3)
    if(KITCHEN_BUILD_AU)
        list(APPEND formats AU)
    endif()
    juce_add_plugin(${target}
        COMPANY_NAME "Sidequest Kitchen"
        BUNDLE_ID "com.sidequest.kitchen.${id}"
        PLUGIN_MANUFACTURER_CODE Ktch
        PLUGIN_CODE ${code}
        FORMATS ${formats}
        PRODUCT_NAME "Kitchen ${bundle_name}"
        PLUGIN_NAME "Kitchen ${bundle_name}"
        IS_SYNTH ${is_instrument}
        NEEDS_MIDI_INPUT ${needs_midi}
        NEEDS_MIDI_OUTPUT ${midi_output}
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS TRUE
        COPY_PLUGIN_AFTER_BUILD FALSE
        VST3_CATEGORIES ${categories}
        HARDENED_RUNTIME_ENABLED TRUE
        HARDENED_RUNTIME_OPTIONS com.apple.security.cs.allow-jit com.apple.security.cs.allow-unsigned-executable-memory)
    target_sources(${target} PRIVATE Source/PluginEntry.cpp)
    target_compile_definitions(${target} PRIVATE KITCHEN_PRODUCT_ID="${id}")
    target_link_libraries(${target} PUBLIC KitchenNativeCore)
    foreach(format IN LISTS formats)
        set(bundle_target "${target}_${format}")
        add_dependencies(${bundle_target} kitchen_dsp_helper)
        add_custom_command(TARGET ${bundle_target} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_BUNDLE_CONTENT_DIR:${bundle_target}>/Resources/Kitchen/ui"
            COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_BUNDLE_CONTENT_DIR:${bundle_target}>/Helpers"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different "$<TARGET_FILE:kitchen_dsp_helper>" "$<TARGET_BUNDLE_CONTENT_DIR:${bundle_target}>/Helpers/KitchenDSPHelper"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different "${KITCHEN_GENERATED}/runtime.js" "${KITCHEN_GENERATED}/products.json" "$<TARGET_BUNDLE_CONTENT_DIR:${bundle_target}>/Resources/Kitchen/"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different "${KITCHEN_GENERATED}/ui/${id}.html" "$<TARGET_BUNDLE_CONTENT_DIR:${bundle_target}>/Resources/Kitchen/ui/${id}.html"
            COMMAND ${CMAKE_COMMAND} "-DKITCHEN_ASSET_SOURCE=${KITCHEN_GENERATED}/assets/${id}" "-DKITCHEN_ASSET_DEST=$<TARGET_BUNDLE_CONTENT_DIR:${bundle_target}>/Resources/Kitchen/assets/${id}" -P "${CMAKE_CURRENT_SOURCE_DIR}/platform/CopyAssets.cmake"
            COMMAND /usr/bin/codesign --force --sign - "$<TARGET_BUNDLE_DIR:${bundle_target}>"
            VERBATIM)
    endforeach()
endfunction()
include("${KITCHEN_GENERATED}/products.cmake")
