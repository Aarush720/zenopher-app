import { readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

// Vite copies the PhotoCraft WebAssembly workspace from public/photocraft into
// dist/photocraft. Keep it in the production artifact: Creative Mode loads the
// editor through /photocraft/index.html at runtime. macOS may also create
// AppleDouble sidecars on the external workspace volume; they are not assets.
async function removeAppleDoubleFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith("._")) {
      await rm(path, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeAppleDoubleFiles(path);
    }
  }
}

await removeAppleDoubleFiles(dist);

async function assertFile(root, relative) {
  const path = resolve(root, relative);
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("is not a file");
  } catch (error) {
    throw new Error(`PhotoCraft asset is missing: ${relative}`, { cause: error });
  }
}

async function verifyJavascriptImports(file) {
  const source = await readFile(file, "utf8");
  for (const [, reference] of source.matchAll(/(?:from|import\s*\()[\s]*["']([^"']+)["']/g)) {
    if (reference.startsWith(".")) await assertFile(dirname(file), reference);
  }
}

async function verifyPhotoCraftBundle() {
  const root = join(dist, "photocraft");
  await assertFile(dist, "photocraft/index.html");
  const index = await readFile(resolve(root, "index.html"), "utf8");
  const references = [
    ...index.matchAll(/(?:href|src)=["']([^"']+)["']/g),
    ...index.matchAll(/(?:from|module_or_path:\s*)["']([^"']+)["']/g),
  ].map(([, reference]) => reference).filter((reference) => reference.startsWith("."));
  for (const reference of references) {
    const cleanReference = reference.split(/[?#]/, 1)[0];
    await assertFile(root, cleanReference);
    if (cleanReference.endsWith(".js")) await verifyJavascriptImports(resolve(root, cleanReference));
  }

  const partsText = await readFile(resolve(root, "app/parts.txt"), "utf8");
  const parts = partsText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("photocraft-parts "));
  if (parts.length === 0) throw new Error("PhotoCraft parts.txt contains no parts");
  for (const part of parts) {
    await assertFile(root, `app/${part}`);
    const bytes = await readFile(resolve(root, "app", part));
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`PhotoCraft part is not gzip data: ${part}`);
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error(`PhotoCraft part exceeds Cloudflare's 25 MiB limit: ${part}`);
  }
}

await verifyPhotoCraftBundle();
