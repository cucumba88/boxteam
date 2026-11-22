// Run with: node --test scripts/progress-format.test.mjs  (Node 22 strips TS types)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionSublabel,
  describeIndexError,
  formatCount,
  formatEta,
  formatEtaShort,
  formatSpeed,
  indexingView,
  percentOf,
} from "../src/lib/progressFormat.ts";

const MB = 1024 ** 2;

test("percentOf clamps and reports unknown totals as null", () => {
  assert.equal(percentOf(0, 0), null);
  assert.equal(percentOf(5, 0), null);
  assert.equal(percentOf(50, 100), 50);
  assert.equal(percentOf(999, 1000), 99, "never shows 100% before it is done");
  assert.equal(percentOf(1000, 1000), 100);
  assert.equal(percentOf(2000, 1000), 100);
});

test("formatCount groups thousands in Spanish", () => {
  assert.equal(formatCount(3726, "es"), "3.726");
  assert.equal(formatCount(3726, "en"), "3,726");
  assert.equal(formatCount(41, "es"), "41");
});

test("formatSpeed uses the same binary units as formatBytes", () => {
  assert.equal(formatSpeed(undefined), "");
  assert.equal(formatSpeed(0), "");
  assert.equal(formatSpeed(-5), "");
  assert.equal(formatSpeed(16.8 * MB), "16.8 MB/s");
  assert.equal(formatSpeed(512 * 1024), "512 KB/s");
});

test("ETA never prints 60 minutes inside an hour", () => {
  // 1 h 59 min 50 s used to render as "1 h 60 min".
  assert.equal(formatEtaShort(1, 7190), "2 h 00 min");
  assert.equal(formatEtaShort(1, 3600 + 5 * 60), "1 h 05 min");
  assert.equal(formatEtaShort(1, 59), "59 s");
  assert.equal(formatEtaShort(1, 61), "2 min");
  assert.equal(formatEtaShort(0, 100), "");
  assert.equal(formatEtaShort(10, 0), "");
  assert.equal(formatEta("es", 1, 120), "2 min restantes");
  assert.equal(formatEta("en", 1, 120), "2 min left");
});

test("indexing view picks the right phase and label", () => {
  assert.deepEqual(indexingView("es", null, null), {
    label: "Buscando archivos en el FTP…",
    percent: null,
  });
  // Web mode used to start with {0,0} and read "Obteniendo metadatos 0 / 0".
  assert.equal(indexingView("es", { current: 0, total: 0 }, null).label, "Buscando archivos en el FTP…");
  assert.deepEqual(indexingView("es", { current: 1250, total: 3726 }, { done: 3, total: 40 }), {
    label: "Indexando archivos · 1.250/3.726",
    percent: 33,
  });
  assert.deepEqual(indexingView("es", { current: 3726, total: 3726 }, { done: 41, total: 312 }), {
    label: "Obteniendo metadatos · 41/312",
    percent: 13,
  });
  assert.deepEqual(indexingView("es", null, { done: 41, total: 312 }), {
    label: "Obteniendo metadatos · 41/312",
    percent: 13,
  });
});

test("completion sublabel pluralises and mentions removed items", () => {
  assert.equal(completionSublabel("es", { newItems: 0, removed: 0 }), "Sin cambios");
  assert.equal(completionSublabel("es", { newItems: 1, removed: 0 }), "1 nuevo");
  assert.equal(
    completionSublabel("es", { newItems: 12, removed: 3 }),
    "12 nuevos · 3 ya no están en el FTP",
  );
  assert.equal(completionSublabel("es", { newItems: null, removed: null }), undefined);
});

test("index errors become actionable Spanish sentences", () => {
  const noFiles = describeIndexError(
    "es",
    "FTP crawl returned 0 media files. Check your Root Path setting.",
  );
  assert.match(noFiles.message, /carpeta raíz/);
  assert.equal(noFiles.detail, undefined);
  const refused = describeIndexError("es", "Connection refused (os error 61)");
  assert.match(refused.message, /No se pudo conectar/);
  assert.equal(refused.detail, "Connection refused (os error 61)");
  assert.match(describeIndexError("es", "530 Login incorrect.").message, /contraseña/);
  assert.equal(describeIndexError("es", "algo raro").message, "algo raro");
});
