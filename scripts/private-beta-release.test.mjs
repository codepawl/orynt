import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readText(path) {
  return readFile(path, "utf8");
}

test("internal desktop beta packaging contract is wired", async () => {
  const rootPackage = await readJson("package.json");
  const desktopPackage = await readJson("apps/desktop/package.json");
  const tauriConfig = await readJson("apps/desktop/src-tauri/tauri.conf.json");

  assert.equal(rootPackage.scripts["package:desktop:internal"], "node scripts/package-desktop-internal.mjs");
  assert.equal(rootPackage.scripts["release:desktop:check"], "node --test scripts/private-beta-release.test.mjs");
  assert.equal(desktopPackage.scripts["tauri:build"], "tauri build --bundles appimage --no-sign --ci");
  assert.equal(tauriConfig.bundle.active, true);
  assert.deepEqual(tauriConfig.bundle.targets, ["appimage"]);
  assert.equal(tauriConfig.bundle.createUpdaterArtifacts, false);
});

test("internal desktop beta packages the exact Orynt built-in skill set", async () => {
  const expected = [
    "bug-fixer",
    "change-planner",
    "code-reviewer",
    "release-readiness",
    "repository-onboarding",
  ];
  const entries = await readdir("packages/skill-registry/builtins", {
    withFileTypes: true,
  });
  assert.deepEqual(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    expected,
  );

  const packagingScript = await readText("scripts/package-desktop-internal.mjs");
  assert.match(packagingScript, /desktop-memory-manager\.mjs/);
  assert.match(packagingScript, /packages", "skill-registry", "builtins/);
  assert.match(
    packagingScript,
    /orynt-runner\/packages\/skill-registry\/builtins/,
  );
  for (const name of expected) {
    assert.match(packagingScript, new RegExp(`"${name}"`));
  }
});

test("Fedora desktop dev launcher hydrates KDE session environment", async () => {
  const launcher = await readText("scripts/dev-desktop-fedora.sh");

  assert.match(launcher, /XDG_RUNTIME_DIR:=\/run\/user\/\$USER_ID/);
  assert.match(launcher, /WAYLAND_DISPLAY=wayland-0/);
  assert.match(launcher, /DBUS_SESSION_BUS_ADDRESS="unix:path=\/run\/user\/\$USER_ID\/bus"/);
  assert.match(launcher, /XAUTHORITY="\/run\/user\/\$USER_ID\/\$\(basename "\$XAUTH_CANDIDATE"\)"/);
  assert.match(launcher, /ORYNT_GDK_BACKEND:-\$DEFAULT_GDK_BACKEND/);
});

test("internal desktop beta docs describe release stance and smoke gates", async () => {
  const readme = await readText("README.md");
  const releaseNotes = await readText("docs/productization/private-beta-release-notes.md");
  const releaseSmoke = await readText("docs/productization/private-beta-release-smoke.md");

  assert.match(readme, /pnpm package:desktop:internal/);
  assert.match(readme, /Unsigned internal Linux beta/);

  for (const expected of [
    "Repository-only scope",
    "Unsigned/manual distribution",
    "Updater disabled",
    "No live billing",
  ]) {
    assert.match(releaseNotes, new RegExp(expected));
  }

  for (const expected of [
    "App launch",
    "First-run onboarding",
    "Provider readiness",
    "Repository run",
    "Skills inventory",
    "Skill context",
    "Persistence reload",
    "Evidence viewer",
    "Disabled surfaces",
    "No live billing",
  ]) {
    assert.match(releaseSmoke, new RegExp(expected));
  }

  assert.match(releaseSmoke, /Local app data/);
  assert.match(releaseSmoke, /Artifact evidence/);
  assert.match(releaseSmoke, /Reset instructions/);
});
