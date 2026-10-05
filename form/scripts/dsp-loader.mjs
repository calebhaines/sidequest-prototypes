import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Compile the production modules into a temporary ESM package. Unlike a data
// URL, file URLs let Node 20 resolve the DSP's real relative dependencies.
export async function loadDsp(entries = ["audio", "modular"]) {
  const directory = await mkdtemp(join(tmpdir(), "form-dsp-test-"));
  const sources = new URL("../src/", import.meta.url);
  const compiled = new Set();
  const cleanup = () => rm(directory, { recursive: true, force: true });
  await writeFile(join(directory, "package.json"), '{"type":"module"}');

  async function compile(name) {
    if (compiled.has(name)) return;
    compiled.add(name);
    const source = await readFile(new URL(`${name}.ts`, sources), "utf8");
    const javascript = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText;
    const dependencies = new Set();
    const rewritten = javascript.replace(
      /\b(from\s+|import\s*)(["'])(\.[^"']+)\2/g,
      (statement, prefix, quote, specifier) => {
        const relative = specifier.replace(/\.(ts|js)$/, "");
        const dependency = fileURLToPath(
          new URL(relative, new URL(`${name}.ts`, sources)),
        ).slice(fileURLToPath(sources).length);
        dependencies.add(dependency);
        return `${prefix}${quote}${relative}.js${quote}`;
      },
    );
    await writeFile(join(directory, `${name}.js`), rewritten);
    for (const dependency of dependencies) await compile(dependency);
  }

  try {
    for (const name of entries) await compile(name);
    const modules = {};
    for (const name of entries) {
      modules[name] = await import(
        pathToFileURL(join(directory, `${name}.js`))
      );
    }
    return { ...modules, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
