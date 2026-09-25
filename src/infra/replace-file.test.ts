// Tests atomic file replacement helpers and permission handling.
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  movePathWithCopyFallback,
  replaceFileAtomic,
  replaceFileAtomicSync,
} from "./replace-file.js";

describe("movePathWithCopyFallback", () => {
  it.runIf(process.platform !== "win32")(
    "rejects hardlinked source files when requested",
    async () => {
      await withTempDir({ prefix: "openclaw-replace-file-" }, async (root) => {
        const sourceDir = path.join(root, "source");
        const targetDir = path.join(root, "target");
        const sourceFile = path.join(sourceDir, "file.txt");
        const linkedFile = path.join(root, "linked.txt");
        await fs.mkdir(sourceDir);
        await fs.writeFile(sourceFile, "hello", "utf8");
        await fs.link(sourceFile, linkedFile);

        await expect(
          movePathWithCopyFallback({
            from: sourceDir,
            sourceHardlinks: "reject",
            to: targetDir,
          }),
        ).rejects.toThrow("Hardlinked source file is not allowed");

        await expect(fs.readFile(sourceFile, "utf8")).resolves.toBe("hello");
        let statError: NodeJS.ErrnoException | undefined;
        try {
          await fs.stat(targetDir);
        } catch (error) {
          statError = error as NodeJS.ErrnoException;
        }
        expect(statError).toBeInstanceOf(Error);
        expect(statError?.code).toBe("ENOENT");
        expect(statError?.path).toBe(targetDir);
        expect(statError?.syscall).toBe("stat");
      });
    },
  );
});

describe("replaceFileAtomic parent directory permissions", () => {
  it.runIf(process.platform !== "win32")(
    "preserves a pre-existing parent directory's mode, including setgid",
    async () => {
      await withTempDir({ prefix: "openclaw-replace-file-" }, async (root) => {
        const parent = path.join(root, "workspace");
        const filePath = path.join(parent, "state.json");
        await fs.mkdir(parent);
        await fs.chmod(parent, 0o2775);

        await replaceFileAtomic({ filePath, content: "{}\n" });

        expect((await fs.stat(parent)).mode & 0o7777).toBe(0o2775);
        await expect(fs.readFile(filePath, "utf8")).resolves.toBe("{}\n");
      });
    },
  );

  it.runIf(process.platform !== "win32")(
    "applies the default dirMode to parent directories it creates",
    async () => {
      await withTempDir({ prefix: "openclaw-replace-file-" }, async (root) => {
        const parent = path.join(root, "created", "nested");
        const filePath = path.join(parent, "state.json");

        await replaceFileAtomic({ filePath, content: "{}\n" });

        expect((await fs.stat(parent)).mode & 0o7777).toBe(0o700);
        await expect(fs.readFile(filePath, "utf8")).resolves.toBe("{}\n");
      });
    },
  );

  it.runIf(process.platform !== "win32")(
    "sync variant preserves a pre-existing parent directory's mode",
    async () => {
      await withTempDir({ prefix: "openclaw-replace-file-" }, async (root) => {
        const parent = path.join(root, "workspace");
        const filePath = path.join(parent, "state.json");
        await fs.mkdir(parent);
        await fs.chmod(parent, 0o2775);

        replaceFileAtomicSync({ filePath, content: "{}\n" });

        expect((await fs.stat(parent)).mode & 0o7777).toBe(0o2775);
        await expect(fs.readFile(filePath, "utf8")).resolves.toBe("{}\n");
      });
    },
  );

  it.runIf(process.platform !== "win32")(
    "sync variant applies an explicit dirMode to parent directories it creates",
    async () => {
      await withTempDir({ prefix: "openclaw-replace-file-" }, async (root) => {
        const parent = path.join(root, "created");
        const filePath = path.join(parent, "state.json");

        replaceFileAtomicSync({ filePath, content: "{}\n", dirMode: 0o750 });

        expect((await fs.stat(parent)).mode & 0o7777).toBe(0o750);
      });
    },
  );
});
