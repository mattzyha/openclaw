// Extra bootstrap file tests cover glob/literal path loading, workspace
// containment checks, symlink handling, and diagnostics for skipped files.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadExtraBootstrapFilesWithDiagnostics } from "./workspace.js";

describe("loadExtraBootstrapFilesWithDiagnostics", () => {
  let fixtureRoot = "";
  let fixtureCount = 0;

  const createWorkspaceDir = async (prefix: string) => {
    const dir = path.join(fixtureRoot, `${prefix}-${fixtureCount++}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  };

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-extra-bootstrap-"));
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  async function loadExtraBootstrapFileList(dir: string, extraPatterns: string[]) {
    const { files } = await loadExtraBootstrapFilesWithDiagnostics(dir, extraPatterns);
    return files;
  }

  it("loads recognized bootstrap files from glob patterns", async () => {
    const workspaceDir = await createWorkspaceDir("glob");
    const packageDir = path.join(workspaceDir, "packages", "core");
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(path.join(packageDir, "TOOLS.md"), "tools", "utf-8");
    await fs.writeFile(path.join(packageDir, "README.md"), "not bootstrap", "utf-8");

    const files = await loadExtraBootstrapFileList(workspaceDir, ["packages/*/*"]);

    expect(files).toStrictEqual([
      {
        name: "TOOLS.md",
        path: path.join(packageDir, "TOOLS.md"),
        content: "tools",
        missing: false,
      },
    ]);
  });

  it("loads glob patterns with explicit current-directory prefixes", async () => {
    const workspaceDir = await createWorkspaceDir("glob-current-dir");
    const packageDir = path.join(workspaceDir, "packages", "core");
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(path.join(packageDir, "AGENTS.md"), "agents", "utf-8");

    const files = await loadExtraBootstrapFileList(workspaceDir, ["./packages/*/AGENTS.md"]);

    expect(files).toStrictEqual([
      {
        name: "AGENTS.md",
        path: path.join(packageDir, "AGENTS.md"),
        content: "agents",
        missing: false,
      },
    ]);
  });

  it("loads literal bootstrap paths with square brackets", async () => {
    const workspaceDir = await createWorkspaceDir("literal-brackets");
    const packageDir = path.join(workspaceDir, "pkg[1]");
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(path.join(packageDir, "AGENTS.md"), "literal agents", "utf-8");

    const files = await loadExtraBootstrapFileList(workspaceDir, ["pkg[1]/AGENTS.md"]);

    expect(files).toStrictEqual([
      {
        name: "AGENTS.md",
        path: path.join(packageDir, "AGENTS.md"),
        content: "literal agents",
        missing: false,
      },
    ]);
  });

  it("keeps path-traversal attempts outside workspace excluded", async () => {
    const rootDir = await createWorkspaceDir("root");
    const workspaceDir = path.join(rootDir, "workspace");
    const outsideDir = path.join(rootDir, "outside");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, "AGENTS.md"), "outside", "utf-8");

    const files = await loadExtraBootstrapFileList(workspaceDir, ["../outside/AGENTS.md"]);

    expect(files).toHaveLength(0);
  });

  it("supports symlinked workspace roots with realpath checks", async () => {
    if (process.platform === "win32") {
      return;
    }

    const rootDir = await createWorkspaceDir("symlink");
    const realWorkspace = path.join(rootDir, "real-workspace");
    const linkedWorkspace = path.join(rootDir, "linked-workspace");
    await fs.mkdir(realWorkspace, { recursive: true });
    await fs.writeFile(path.join(realWorkspace, "AGENTS.md"), "linked agents", "utf-8");
    await fs.symlink(realWorkspace, linkedWorkspace, "dir");

    const files = await loadExtraBootstrapFileList(linkedWorkspace, ["AGENTS.md"]);

    expect(files).toStrictEqual([
      {
        name: "AGENTS.md",
        path: path.join(linkedWorkspace, "AGENTS.md"),
        content: "linked agents",
        missing: false,
      },
    ]);
  });

  it("rejects hardlinked aliases to files outside workspace", async () => {
    // Hardlinks can look like in-workspace files by path; inode/realpath checks
    // keep outside bootstrap content from entering the prompt.
    if (process.platform === "win32") {
      return;
    }

    const rootDir = await createWorkspaceDir("hardlink");
    const workspaceDir = path.join(rootDir, "workspace");
    const outsideDir = path.join(rootDir, "outside");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, "AGENTS.md");
    const linkedFile = path.join(workspaceDir, "AGENTS.md");
    await fs.writeFile(outsideFile, "outside", "utf-8");
    try {
      await fs.link(outsideFile, linkedFile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EXDEV") {
        return;
      }
      throw err;
    }

    const files = await loadExtraBootstrapFileList(workspaceDir, ["AGENTS.md"]);
    expect(files).toHaveLength(0);
  });

  it("loads operator-trusted absolute paths outside the workspace", async () => {
    const rootDir = await createWorkspaceDir("operator-absolute");
    const workspaceDir = path.join(rootDir, "workspace");
    const sharedDir = path.join(rootDir, "shared");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(sharedDir, { recursive: true });
    const sharedFile = path.join(sharedDir, "AGENTS.md");
    await fs.writeFile(sharedFile, "global agents", "utf-8");

    const files = await loadExtraBootstrapFileList(workspaceDir, [sharedFile]);

    expect(files).toStrictEqual([
      {
        name: "AGENTS.md",
        path: sharedFile,
        content: "global agents",
        missing: false,
      },
    ]);
  });

  it("expands ~ patterns against the effective home", async () => {
    const homeDir = await createWorkspaceDir("operator-home");
    await fs.writeFile(path.join(homeDir, "AGENTS.md"), "home agents", "utf-8");
    const workspaceDir = await createWorkspaceDir("operator-home-workspace");

    const previousHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_HOME = homeDir;
    try {
      const files = await loadExtraBootstrapFileList(workspaceDir, ["~/AGENTS.md"]);
      expect(files).toStrictEqual([
        {
          name: "AGENTS.md",
          path: path.join(homeDir, "AGENTS.md"),
          content: "home agents",
          missing: false,
        },
      ]);
    } finally {
      if (previousHome === undefined) {
        delete process.env.OPENCLAW_HOME;
      } else {
        process.env.OPENCLAW_HOME = previousHome;
      }
    }
  });

  it("applies the basename restriction to operator-trusted absolute paths", async () => {
    const rootDir = await createWorkspaceDir("operator-basename");
    const workspaceDir = path.join(rootDir, "workspace");
    const sharedDir = path.join(rootDir, "shared");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(sharedDir, { recursive: true });
    const sharedFile = path.join(sharedDir, "README.md");
    await fs.writeFile(sharedFile, "not bootstrap", "utf-8");

    const { files, diagnostics } = await loadExtraBootstrapFilesWithDiagnostics(workspaceDir, [
      sharedFile,
    ]);

    expect(files).toHaveLength(0);
    expect(diagnostics.map((diagnostic) => diagnostic.reason)).toContain(
      "invalid-bootstrap-filename",
    );
  });

  it("keeps the size cap on operator-trusted absolute paths", async () => {
    const rootDir = await createWorkspaceDir("operator-oversized");
    const workspaceDir = path.join(rootDir, "workspace");
    const sharedDir = path.join(rootDir, "shared");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(sharedDir, { recursive: true });
    const sharedFile = path.join(sharedDir, "AGENTS.md");
    await fs.writeFile(sharedFile, "x".repeat(2 * 1024 * 1024 + 1), "utf-8");

    const { files, diagnostics } = await loadExtraBootstrapFilesWithDiagnostics(workspaceDir, [
      sharedFile,
    ]);

    expect(files).toHaveLength(0);
    expect(diagnostics.map((diagnostic) => diagnostic.reason)).toContain("security");
  });

  it("rejects operator-trusted paths that are symlinks to another directory", async () => {
    // Trust covers the configured location, not whatever a symlink planted at
    // that location resolves to — an agent-writable file swapped for a symlink
    // must not smuggle outside content into the prompt.
    if (process.platform === "win32") {
      return;
    }

    const rootDir = await createWorkspaceDir("operator-symlink");
    const workspaceDir = path.join(rootDir, "workspace");
    const sharedDir = path.join(rootDir, "shared");
    const outsideDir = path.join(rootDir, "outside");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(sharedDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, "AGENTS.md");
    await fs.writeFile(outsideFile, "outside", "utf-8");
    const sharedLink = path.join(sharedDir, "AGENTS.md");
    await fs.symlink(outsideFile, sharedLink, "file");

    const { files, diagnostics } = await loadExtraBootstrapFilesWithDiagnostics(workspaceDir, [
      sharedLink,
    ]);

    expect(files).toHaveLength(0);
    expect(diagnostics.map((diagnostic) => diagnostic.reason)).toContain("security");
  });

  it("still rejects workspace-relative symlinks that escape the workspace", async () => {
    // The operator-trusted bypass is for absolute config paths only; a symlink
    // placed inside the agent-writable workspace must not smuggle outside
    // content into the prompt.
    if (process.platform === "win32") {
      return;
    }

    const rootDir = await createWorkspaceDir("symlink-escape");
    const workspaceDir = path.join(rootDir, "workspace");
    const outsideDir = path.join(rootDir, "outside");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, "AGENTS.md");
    await fs.writeFile(outsideFile, "outside", "utf-8");
    await fs.symlink(outsideFile, path.join(workspaceDir, "AGENTS.md"), "file");

    const { files, diagnostics } = await loadExtraBootstrapFilesWithDiagnostics(workspaceDir, [
      "AGENTS.md",
    ]);

    expect(files).toHaveLength(0);
    expect(diagnostics.map((diagnostic) => diagnostic.reason)).toContain("security");
  });

  it("skips oversized bootstrap files and reports diagnostics", async () => {
    const workspaceDir = await createWorkspaceDir("oversized");
    const payload = "x".repeat(2 * 1024 * 1024 + 1);
    await fs.writeFile(path.join(workspaceDir, "AGENTS.md"), payload, "utf-8");

    const { files, diagnostics } = await loadExtraBootstrapFilesWithDiagnostics(workspaceDir, [
      "AGENTS.md",
    ]);

    expect(files).toHaveLength(0);
    expect(diagnostics.map((diagnostic) => diagnostic.reason)).toContain("security");
  });
});
