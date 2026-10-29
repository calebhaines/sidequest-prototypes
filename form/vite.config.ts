import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

export default defineConfig(async () => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const helper = [new URL("./shared/bundle_audio_exchange.mjs", import.meta.url), new URL("../shared/bundle_audio_exchange.mjs", import.meta.url)]
    .map(url => fileURLToPath(url)).find(path => existsSync(path));
  if (!helper) throw Error("Missing Kitchen build helpers.");
  const { embedVoiceEffects } = await import(pathToFileURL(helper).href);
  return { plugins: [{ name: "kitchen-voice-effects", transformIndexHtml: { order: "pre", handler: (html: string) => embedVoiceEffects(html, root) } }, react()], base: "./" };
});
