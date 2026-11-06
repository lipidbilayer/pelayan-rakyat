import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(repoRoot, "apps", "web");
const astroBin = path.join(webDir, "node_modules", ".bin", "astro");

function tempDir(prefix) {
  // Astro renames its prerender assets into outDir, which requires the same
  // filesystem as the project. /tmp can be tmpfs, so keep fixtures under the
  // web app and remove them afterwards.
  return fs.mkdtempSync(path.join(webDir, "." + prefix));
}

// Minimal PocketBase-shaped API used only by the build guards. It returns
// fixture people and empty collections for everything else.
function startFixtureApi(initialPeople) {
  const state = {
    people: Array.from({ length: initialPeople }, (_, index) => ({
      id: `fixtureperson${index}`,
      slug: `fixture-person-${index}`,
      full_name: `Fixture Person ${index}`,
      verification_status: "verified",
    })),
  };
  const collections = {
    parties: [],
    institutions: [],
    dapil: [],
    sources: [],
    positions: [],
    status_events: [],
    topics: [],
    records: [],
    promise_updates: [],
    replies: [],
    record_changes: [],
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://fixture");
    const match = url.pathname.match(/^\/api\/collections\/([^/]+)\/records$/);
    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
      return;
    }
    const name = match[1];
    const items = name === "people" ? state.people : collections[name] || [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      page: 1,
      perPage: Math.max(items.length, 1),
      totalItems: items.length,
      totalPages: 1,
      items,
    }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        state,
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => {
          server.close(() => done());
          server.closeAllConnections();
        }),
      });
    });
  });
}

function runBuild(outDir, env) {
  // Spawn asynchronously: the fixture API lives in this process, so a
  // synchronous spawn would block the event loop and deadlock the build.
  // Logs go to a file instead of pipes so inherited stdio cannot keep us
  // waiting after Astro exits.
  const logPath = path.join(path.dirname(outDir), "build.log");
  const logFd = fs.openSync(logPath, "w");
  return new Promise((resolve) => {
    const child = spawn(astroBin, ["build", "--outDir", outDir], {
      cwd: webDir,
      env: Object.assign({}, process.env, env),
      stdio: ["ignore", logFd, logFd],
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), 300000);
    const finish = (status, signal) => {
      clearTimeout(timer);
      fs.closeSync(logFd);
      resolve({ status, signal, stdout: fs.readFileSync(logPath, "utf8"), stderr: "" });
    };
    child.on("error", () => finish(null, "spawn-error"));
    child.on("exit", finish);
  });
}

function linkState(target) {
  try {
    const stat = fs.lstatSync(target);
    return stat.isSymbolicLink() ? fs.readlinkSync(target) : "not-a-symlink";
  } catch (error) {
    return "missing";
  }
}

test("B1.3 closed-port build fails and leaves /srv/site unchanged", async () => {
  const work = tempDir("pelayan-b13-");
  const stagingRoot = path.join(work, "srv", "site");
  const previous = path.join(work, "previous-site");
  fs.mkdirSync(previous, { recursive: true });
  fs.mkdirSync(path.dirname(stagingRoot), { recursive: true });
  fs.symlinkSync(previous, stagingRoot);

  const realStaging = "/srv/site";
  const realBefore = linkState(realStaging);
  const localBefore = linkState(stagingRoot);

  const result = await runBuild(path.join(work, "dist"), {
    PB_PUBLIC_URL: "http://127.0.0.1:1",
    LAST_MANIFEST_PATH: path.join(work, "last-manifest.json"),
  });

  const realAfter = linkState(realStaging);
  const localAfter = linkState(stagingRoot);
  assert.notEqual(result.status, 0, "closed-port build unexpectedly succeeded");
  assert.equal(realAfter, realBefore, "/srv/site changed after a failed build");
  assert.equal(localAfter, localBefore, "staging symlink changed after a failed build");
  console.log(`[B1.3] exit=${result.status} /srv/site ${realBefore} -> ${realAfter} (unchanged=${realAfter === realBefore}) staging-proxy ${localBefore} -> ${localAfter} (unchanged=${localAfter === localBefore})`);
  fs.rmSync(work, { recursive: true, force: true });
});

test("B1.4 two-build drop guard: 10 then 7 people fails and ALLOW_DROP=1 passes", async () => {
  const fixture = await startFixtureApi(10);
  const work = tempDir("pelayan-b14-");
  const manifestPath = path.join(work, "last-manifest.json");
  try {
    // First build: ten verified people, no previous manifest.
    const first = await runBuild(path.join(work, "dist-10"), {
      PB_PUBLIC_URL: fixture.url,
      LAST_MANIFEST_PATH: manifestPath,
    });
    assert.equal(first.status, 0, "first fixture build failed:\n" + first.stdout + first.stderr);
    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(written.counts.people, 10, "first build did not write the people count");

    // Second build: only seven verified people, previous manifest says ten.
    fixture.state.people.splice(7);
    const second = await runBuild(path.join(work, "dist-7"), {
      PB_PUBLIC_URL: fixture.url,
      LAST_MANIFEST_PATH: manifestPath,
    });
    const secondOutput = second.stdout + second.stderr;
    assert.notEqual(second.status, 0, "drop from 10 to 7 people unexpectedly built");
    assert.match(secondOutput, /Verified people dropped from 10 to 7/, secondOutput);

    // Third build: same drop, explicitly allowed.
    const third = await runBuild(path.join(work, "dist-7-allowed"), {
      PB_PUBLIC_URL: fixture.url,
      LAST_MANIFEST_PATH: manifestPath,
      ALLOW_DROP: "true",
    });
    assert.equal(third.status, 0, "ALLOW_DROP build failed:\n" + third.stdout + third.stderr);
    console.log("[B1.4] 10-person build=0, 7-person build=" + second.status + ", 7-person ALLOW_DROP=0");
  } finally {
    await fixture.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test("I.6 missing committed OFL font fails the build", async () => {
  const fixture = await startFixtureApi(1);
  const work = tempDir("pelayan-i6-");
  const fontPath = path.join(webDir, "fonts", "OpenSans-Regular.ttf");
  const licensePath = path.join(webDir, "fonts", "OFL.txt");
  const backupPath = fontPath + ".verify-missing";
  assert.equal(fs.existsSync(licensePath), true, "fonts/OFL.txt is missing");
  assert.equal(fs.existsSync(fontPath), true, "committed font is missing");
  if (fs.existsSync(backupPath)) fs.rmSync(backupPath);
  fs.renameSync(fontPath, backupPath);
  try {
    const result = await runBuild(path.join(work, "dist"), {
      PB_PUBLIC_URL: fixture.url,
      LAST_MANIFEST_PATH: path.join(work, "last-manifest.json"),
    });
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, "build unexpectedly succeeded without the OG font");
    assert.match(output, /OG font missing/, output.slice(-2000));
    console.log("[I.6] font removed: build=" + result.status + " (OG font missing)");
  } finally {
    fs.renameSync(backupPath, fontPath);
    await fixture.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
});
