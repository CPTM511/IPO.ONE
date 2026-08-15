import assert from "node:assert/strict";
import test from "node:test";
import {
  M1BOperationalBrowserJpegError,
  validateM1BOperationalBrowserJpeg
} from "../src/m1-b-operational-browser-jpeg.js";

test("standalone JPEG validator rejects non-JPEG bytes before decoding", () => {
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      Buffer.alloc(256),
      { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 }
    ),
    /not a bounded JPEG/
  );
});

test("standalone JPEG validator reports one closed parser error type", () => {
  try {
    validateM1BOperationalBrowserJpeg(
      Buffer.from([0xff, 0xd8, ...Array(126).fill(0)]),
      { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 }
    );
    assert.fail("invalid marker bytes must reject");
  } catch (error) {
    assert.equal(error instanceof M1BOperationalBrowserJpegError, true);
    assert.equal(error.code, "operational_browser_jpeg_invalid");
    assert.match(error.message, /marker bytes/);
  }
});
