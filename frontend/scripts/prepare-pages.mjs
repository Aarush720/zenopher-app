import { readdir, rm } from "node:fs/promises";
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
