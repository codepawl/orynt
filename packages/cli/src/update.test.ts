import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it, vi } from "bun:test";

import {
  canonicalManifest,
  checkForStartupUpdate,
  type ReleaseManifestV1,
  runUpdateCli,
  verifyReleaseManifest,
} from "./update";

function signedManifest(version = "0.2.0"): {
  manifest: ReleaseManifestV1;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const unsigned: Omit<ReleaseManifestV1, "signature"> = {
    schemaVersion: 1,
    channel: "stable",
    version,
    publishedAt: "2026-08-02T00:00:00.000Z",
    minimumCliVersion: "0.1.0",
    keyId: "fixture-2026",
    assets: [{
      platform: "linux",
      arch: "x64",
      installKind: "native",
      url: "https://github.com/codepawl/orynt/releases/download/v0.2.0/orynt-linux-x64.tar.gz",
      size: 42,
      sha256: "a".repeat(64),
    }],
  };
  return {
    manifest: {
      ...unsigned,
      signature: sign(
        null,
        Buffer.from(canonicalManifest(unsigned)),
        privateKey,
      ).toString("base64"),
    },
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

describe("signed CLI updater", () => {
  it("accepts an authentic stable manifest and rejects tampering", () => {
    const fixture = signedManifest();
    expect(() =>
      verifyReleaseManifest(fixture.manifest, {
        [fixture.manifest.keyId]: fixture.publicKeyPem,
      })
    ).not.toThrow();
    expect(() =>
      verifyReleaseManifest(
        { ...fixture.manifest, version: "0.3.0" },
        { [fixture.manifest.keyId]: fixture.publicKeyPem },
      )
    ).toThrow(/signature/i);
  });

  it("rejects prerelease versions on the stable channel", () => {
    const fixture = signedManifest("0.2.0-beta.1");
    expect(() =>
      verifyReleaseManifest(fixture.manifest, {
        [fixture.manifest.keyId]: fixture.publicKeyPem,
      })
    ).toThrow(/schema/i);
  });

  it("updates npm installs with structured argv after confirmation", async () => {
    const fixture = signedManifest();
    const execFile = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const output: string[] = [];
    const code = await runUpdateCli(["--yes"], {
      stateRoot: "/tmp/orynt-update-fixture",
      write: (line) => output.push(line),
      publicKeys: { [fixture.manifest.keyId]: fixture.publicKeyPem },
      manifestUrl: "https://example.test/release-manifest.json",
      fetch: vi.fn(async () => new Response(
        JSON.stringify(fixture.manifest),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch,
      execFile: execFile as never,
    });
    expect(code).toBe(0);
    expect(execFile).toHaveBeenCalledWith(
      "npm",
      ["install", "--global", "orynt@0.2.0"],
      expect.objectContaining({ timeout: 120_000 }),
    );
    expect(output.join("\n")).toContain("Updated npm-managed Orynt");
  });

  it("follows bounded release redirects and rejects HTTPS downgrades", async () => {
    const fixture = signedManifest();
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://example.test/release-manifest.json") {
        return new Response(null, {
          status: 302,
          headers: { location: "/objects/release-manifest.json" },
        });
      }
      return new Response(JSON.stringify(fixture.manifest), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const output: string[] = [];
    await expect(runUpdateCli(["--check"], {
      stateRoot: "/tmp/orynt-update-redirect-fixture",
      write: (line) => output.push(line),
      publicKeys: { [fixture.manifest.keyId]: fixture.publicKeyPem },
      manifestUrl: "https://example.test/release-manifest.json",
      fetch: fetch as typeof globalThis.fetch,
    })).resolves.toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);

    await expect(runUpdateCli(["--check"], {
      stateRoot: "/tmp/orynt-update-downgrade-fixture",
      write: () => undefined,
      publicKeys: { [fixture.manifest.keyId]: fixture.publicKeyPem },
      manifestUrl: "https://example.test/release-manifest.json",
      fetch: vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location: "http://example.test/manifest.json" },
      })) as typeof globalThis.fetch,
    })).rejects.toThrow(/HTTPS downgrade/i);
  });

  it("enforces minimumCliVersion before invoking a package manager", async () => {
    const strictFixture = signedManifestWithMinimum("0.2.0");
    const execFile = vi.fn();
    const output: string[] = [];
    await expect(runUpdateCli(["--yes"], {
      stateRoot: "/tmp/orynt-update-minimum-fixture",
      write: (line) => output.push(line),
      publicKeys: {
        [strictFixture.manifest.keyId]: strictFixture.publicKeyPem,
      },
      manifestUrl: "https://example.test/release-manifest.json",
      fetch: vi.fn(async () => new Response(
        JSON.stringify(strictFixture.manifest),
        { status: 200 },
      )) as typeof globalThis.fetch,
      execFile: execFile as never,
    })).resolves.toBe(1);
    expect(execFile).not.toHaveBeenCalled();
    expect(output.join("\n")).toMatch(/reinstall/i);
  });

  it("never checks for startup updates without stored consent", async () => {
    const fetch = vi.fn();
    await expect(checkForStartupUpdate({
      stateRoot: "/tmp/orynt-update-consent-fixture",
      consent: "unknown",
      fetch: fetch as typeof globalThis.fetch,
    })).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("changes startup consent without making an update request", async () => {
    const saveStartupConsent = vi.fn(async () => undefined);
    const fetch = vi.fn();
    const output: string[] = [];
    await expect(runUpdateCli(["--disable-startup-check"], {
      stateRoot: "/tmp/orynt-update-consent-command",
      write: (line) => output.push(line),
      saveStartupConsent,
      fetch: fetch as typeof globalThis.fetch,
    })).resolves.toBe(0);
    expect(saveStartupConsent).toHaveBeenCalledWith("disabled");
    expect(fetch).not.toHaveBeenCalled();
    expect(output).toEqual(["Startup update checks disabled."]);
  });

  it("rejects a valid signature from an unknown key id", () => {
    const fixture = signedManifest();
    expect(() => verifyReleaseManifest(fixture.manifest, {}))
      .toThrow(/unknown signing key/i);
  });
});

function signedManifestWithMinimum(minimumCliVersion: string): {
  manifest: ReleaseManifestV1;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const unsigned: Omit<ReleaseManifestV1, "signature"> = {
    schemaVersion: 1,
    channel: "stable",
    version: "0.2.0",
    publishedAt: "2026-08-02T00:00:00.000Z",
    minimumCliVersion,
    keyId: "fixture-2026",
    assets: [{
      platform: "linux",
      arch: "x64",
      installKind: "native",
      url: "https://github.com/codepawl/orynt/releases/download/v0.2.0/orynt-linux-x64.tar.gz",
      size: 42,
      sha256: "a".repeat(64),
    }],
  };
  return {
    manifest: {
      ...unsigned,
      signature: sign(
        null,
        Buffer.from(canonicalManifest(unsigned)),
        privateKey,
      ).toString("base64"),
    },
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
