import { createHash } from "node:crypto";
import {
  M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS,
  M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE
} from "../../web/src/m1-b-operational-browser-measurement-console.js";

const HASH = /^0x[0-9a-f]{64}$/;
const MAXIMUM_ICC_PROFILE_BYTES = 4 * 1024 * 1024;
const JPEG_QUALITY_80_QUANTIZATION_TABLES = Object.freeze({
  0: Object.freeze([
    6, 4, 5, 6, 5, 4, 6, 6, 5, 6, 7, 7, 6, 8, 10, 16,
    10, 10, 9, 9, 10, 20, 14, 15, 12, 16, 23, 20, 24, 24, 23, 20,
    22, 22, 26, 29, 37, 31, 26, 27, 35, 28, 22, 22, 32, 44, 32, 35,
    38, 39, 41, 42, 41, 25, 31, 45, 48, 45, 40, 48, 37, 40, 41, 40
  ]),
  1: Object.freeze([
    7, 7, 7, 10, 8, 10, 19, 10, 10, 19, 40, 26, 22, 26, 40, 40,
    40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
    40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
    40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40
  ])
});

export class M1BOperationalBrowserJpegError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalBrowserJpegError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalBrowserJpegError(code, message);
}

function plain(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function bitsToHex(bits) {
  let output = "";
  for (let offset = 0; offset < bits.length; offset += 4) {
    output += Number.parseInt(bits.slice(offset, offset + 4).join(""), 2)
      .toString(16);
  }
  return output;
}

function jpegFail(message) {
  fail("operational_browser_jpeg_invalid", message);
}

function exactBytes(actual, expected) {
  return actual.length === expected.length && actual.every(
    (value, index) => value === expected[index]
  );
}

function parseJpegQuantizationTables(data, tables) {
  let offset = 0;
  while (offset < data.length) {
    if (offset + 65 > data.length) jpegFail("JPEG DQT is truncated.");
    const descriptor = data[offset];
    const precision = descriptor >>> 4;
    const tableId = descriptor & 0x0f;
    const values = Array.from(data.subarray(offset + 1, offset + 65));
    if (
      precision !== 0 || !new Set([0, 1]).has(tableId) ||
      tables.has(tableId) ||
      !exactBytes(values, JPEG_QUALITY_80_QUANTIZATION_TABLES[tableId])
    ) jpegFail("JPEG DQT is not the exact Chrome quality-80 profile.");
    tables.set(tableId, Object.freeze(values));
    offset += 65;
  }
  if (offset !== data.length) jpegFail("JPEG DQT length is invalid.");
}

function createCanonicalHuffmanTable({ tableClass, tableId, counts, symbols }) {
  const symbolsByCodeLength = Array.from({ length: 17 }, () => new Map());
  let available = 1;
  let code = 0;
  let symbolOffset = 0;
  const seenSymbols = new Set();
  for (let length = 1; length <= 16; length += 1) {
    available = available * 2 - counts[length - 1];
    if (available < 0) jpegFail("JPEG Huffman table is oversubscribed.");
    for (let index = 0; index < counts[length - 1]; index += 1) {
      const symbol = symbols[symbolOffset++];
      if (seenSymbols.has(symbol)) {
        jpegFail("JPEG Huffman table repeats a symbol.");
      }
      seenSymbols.add(symbol);
      if (
        (tableClass === 0 && symbol > 11) ||
        (tableClass === 1 && (
          (symbol & 0x0f) > 10 ||
          ((symbol & 0x0f) === 0 && !new Set([0, 15]).has(symbol >>> 4))
        ))
      ) jpegFail("JPEG Huffman table contains an invalid baseline symbol.");
      symbolsByCodeLength[length].set(code, symbol);
      code += 1;
    }
    code *= 2;
  }
  if (available === 0) {
    jpegFail("JPEG Huffman table is complete and consumes the padding all-ones code.");
  }
  return Object.freeze({
    tableClass,
    tableId,
    symbolsByCodeLength: Object.freeze(symbolsByCodeLength)
  });
}

function parseJpegHuffmanTables(data, tables) {
  let offset = 0;
  while (offset < data.length) {
    if (offset + 17 > data.length) jpegFail("JPEG DHT is truncated.");
    const descriptor = data[offset];
    const tableClass = descriptor >>> 4;
    const tableId = descriptor & 0x0f;
    const counts = Array.from(data.subarray(offset + 1, offset + 17));
    const symbolCount = counts.reduce((total, count) => total + count, 0);
    const end = offset + 17 + symbolCount;
    const key = `${tableClass}:${tableId}`;
    if (
      !new Set([0, 1]).has(tableClass) || !new Set([0, 1]).has(tableId) ||
      symbolCount < 1 || symbolCount > 256 || end > data.length || tables.has(key)
    ) jpegFail("JPEG DHT is invalid or duplicated.");
    const symbols = Array.from(data.subarray(offset + 17, end));
    tables.set(key, createCanonicalHuffmanTable({
      tableClass,
      tableId,
      counts,
      symbols
    }));
    offset = end;
  }
  if (offset !== data.length) jpegFail("JPEG DHT length is invalid.");
}

function parseJpegFrame(data) {
  if (data.length !== 15 || data[0] !== 8 || data[5] !== 3) {
    jpegFail("JPEG SOF0 must be 8-bit three-component baseline data.");
  }
  const height = data.readUInt16BE(1);
  const width = data.readUInt16BE(3);
  const components = [0, 1, 2].map((index) => {
    const offset = 6 + index * 3;
    return Object.freeze({
      id: data[offset],
      horizontalSampling: data[offset + 1] >>> 4,
      verticalSampling: data[offset + 1] & 0x0f,
      quantizationTableId: data[offset + 2]
    });
  });
  const expected = [
    { id: 1, horizontalSampling: 2, verticalSampling: 2, quantizationTableId: 0 },
    { id: 2, horizontalSampling: 1, verticalSampling: 1, quantizationTableId: 1 },
    { id: 3, horizontalSampling: 1, verticalSampling: 1, quantizationTableId: 1 }
  ];
  if (
    width < 1 || height < 1 ||
    width > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumWidth ||
    height > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumHeight ||
    width * height > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumPixels ||
    components.some((component, index) =>
      Object.keys(expected[index]).some(
        (key) => component[key] !== expected[index][key]
      )
    )
  ) jpegFail("JPEG SOF0 dimensions or 4:2:0 component profile is invalid.");
  return Object.freeze({ width, height, components: Object.freeze(components) });
}

function parseJpegScanHeader(data, frame) {
  if (
    data.length !== 10 || data[0] !== 3 ||
    data[1] !== 1 || data[2] !== 0x00 ||
    data[3] !== 2 || data[4] !== 0x11 ||
    data[5] !== 3 || data[6] !== 0x11 ||
    data[7] !== 0 || data[8] !== 63 || data[9] !== 0 ||
    frame.components.length !== 3
  ) jpegFail("JPEG must contain one exact sequential interleaved scan.");
  return Object.freeze([
    Object.freeze({ ...frame.components[0], dcTableId: 0, acTableId: 0 }),
    Object.freeze({ ...frame.components[1], dcTableId: 1, acTableId: 1 }),
    Object.freeze({ ...frame.components[2], dcTableId: 1, acTableId: 1 })
  ]);
}

function findJpegEntropyEnd(bytes, start) {
  let offset = start;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    if (offset + 1 >= bytes.length) jpegFail("JPEG entropy data is truncated.");
    const marker = bytes[offset + 1];
    if (marker === 0x00) {
      offset += 2;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      jpegFail("JPEG restart markers are unsupported and forbidden.");
    }
    if (marker !== 0xd9) {
      jpegFail("JPEG entropy contains an unexpected marker or extra scan.");
    }
    if (offset + 2 !== bytes.length) jpegFail("JPEG has trailing bytes after EOI.");
    return offset;
  }
  jpegFail("JPEG scan is missing EOI.");
}

function createJpegEntropyReader(bytes, start, end) {
  let offset = start;
  let currentByte = 0;
  let remainingBits = 0;
  function loadByte() {
    if (offset >= end) jpegFail("JPEG entropy data ends before all MCUs decode.");
    currentByte = bytes[offset++];
    if (currentByte === 0xff) {
      if (offset >= end || bytes[offset++] !== 0x00) {
        jpegFail("JPEG entropy byte stuffing is invalid.");
      }
    }
    remainingBits = 8;
  }
  return Object.freeze({
    readBit() {
      if (remainingBits === 0) loadByte();
      remainingBits -= 1;
      return (currentByte >>> remainingBits) & 1;
    },
    readBits(length) {
      let value = 0;
      for (let index = 0; index < length; index += 1) {
        value = value * 2 + this.readBit();
      }
      return value;
    },
    assertComplete() {
      if (offset !== end) jpegFail("JPEG entropy contains data after the final MCU.");
      if (
        remainingBits > 0 &&
        (currentByte & ((1 << remainingBits) - 1)) !== (1 << remainingBits) - 1
      ) jpegFail("JPEG entropy padding is not the required all-ones suffix.");
    }
  });
}

function decodeJpegHuffmanSymbol(reader, table) {
  let code = 0;
  for (let length = 1; length <= 16; length += 1) {
    code = code * 2 + reader.readBit();
    const symbol = table.symbolsByCodeLength[length].get(code);
    if (symbol !== undefined) return symbol;
  }
  jpegFail("JPEG entropy uses an undefined Huffman code.");
}

function receiveJpegValue(reader, length) {
  if (length === 0) return 0;
  const encoded = reader.readBits(length);
  const threshold = 2 ** (length - 1);
  return encoded < threshold ? encoded - (2 ** length - 1) : encoded;
}

function decodeJpegBlock(reader, dcTable, acTable, previousDc) {
  const category = decodeJpegHuffmanSymbol(reader, dcTable);
  const dc = previousDc + receiveJpegValue(reader, category);
  if (dc < -2_048 || dc > 2_047) {
    jpegFail("JPEG DC predictor is outside the baseline range.");
  }
  let coefficient = 1;
  let acAllZero = true;
  while (coefficient < 64) {
    const symbol = decodeJpegHuffmanSymbol(reader, acTable);
    if (symbol === 0x00) break;
    if (symbol === 0xf0) {
      coefficient += 16;
      if (coefficient > 64) jpegFail("JPEG AC zero run exceeds its block.");
      continue;
    }
    const run = symbol >>> 4;
    const size = symbol & 0x0f;
    coefficient += run;
    if (coefficient >= 64) jpegFail("JPEG AC coefficient exceeds its block.");
    receiveJpegValue(reader, size);
    acAllZero = false;
    coefficient += 1;
  }
  return Object.freeze({ dc, acAllZero });
}

function createPixelChallengeCollector(devicePixelRatio) {
  const specification = M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE;
  const physicalOffsetX = specification.offsetX * devicePixelRatio;
  const physicalOffsetY = specification.offsetY * devicePixelRatio;
  const physicalCellSize = specification.cellSize * devicePixelRatio;
  const physicalRight = physicalOffsetX + specification.columns * physicalCellSize;
  const physicalBottom = physicalOffsetY + specification.rows * physicalCellSize;
  const cells = Array.from(
    { length: specification.columns * specification.rows },
    () => ({ bit: null, blockCount: 0 })
  );
  return Object.freeze({
    observe({ blockX, blockY, dc, acAllZero, dcQuantizer }) {
      const pixelX = blockX * 8;
      const pixelY = blockY * 8;
      if (
        pixelX < physicalOffsetX || pixelY < physicalOffsetY ||
        pixelX >= physicalRight || pixelY >= physicalBottom
      ) return;
      if (!acAllZero) {
        jpegFail("JPEG pixel challenge luma block has nonzero AC coefficients.");
      }
      const lumaAverage = dc * dcQuantizer / 8 + 128;
      const bit = lumaAverage <= 32 ? 1 : lumaAverage >= 223 ? 0 : null;
      if (bit === null) {
        jpegFail("JPEG pixel challenge luma DC is not black or white.");
      }
      const column = Math.floor((pixelX - physicalOffsetX) / physicalCellSize);
      const row = Math.floor((pixelY - physicalOffsetY) / physicalCellSize);
      const cell = cells[row * specification.columns + column];
      if (cell.bit !== null && cell.bit !== bit) {
        jpegFail("JPEG pixel challenge cell luma blocks disagree.");
      }
      cell.bit = bit;
      cell.blockCount += 1;
    },
    bits() {
      const expectedBlocks = devicePixelRatio ** 2;
      if (cells.some(({ bit, blockCount }) =>
        bit === null || blockCount !== expectedBlocks)) {
        jpegFail("JPEG pixel challenge does not contain every aligned luma block.");
      }
      return cells.map(({ bit }) => bit);
    }
  });
}

function decodeM1BOperationalBrowserPixelChallenge(bits) {
  const specification = M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE;
  const prefixBits = specification.locatorPrefixHex.length * 4;
  const payloadBits = 256;
  const checksumBits = 32;
  const locatorPrefix = bitsToHex(bits.slice(0, prefixBits));
  const payloadHex = bitsToHex(bits.slice(prefixBits, prefixBits + payloadBits));
  const checksumHex = bitsToHex(bits.slice(
    prefixBits + payloadBits,
    prefixBits + payloadBits + checksumBits
  ));
  const locatorSuffix = bitsToHex(bits.slice(prefixBits + payloadBits + checksumBits));
  if (
    locatorPrefix !== specification.locatorPrefixHex ||
    locatorSuffix !== specification.locatorSuffixHex
  ) jpegFail("JPEG pixel challenge locator is invalid.");
  const expectedChecksum = crc32(Buffer.from(payloadHex, "hex"))
    .toString(16)
    .padStart(8, "0");
  if (checksumHex !== expectedChecksum) {
    jpegFail("JPEG pixel challenge checksum is invalid.");
  }
  return `0x${payloadHex}`;
}

export function validateM1BOperationalBrowserJpeg(
  bytes,
  viewport,
  expectedChallengeHash = null
) {
  if (
    !Buffer.isBuffer(bytes) || bytes.length < 128 ||
    bytes.length > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumBytes ||
    bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    !plain(viewport) ||
    !Number.isSafeInteger(viewport.innerWidth) || viewport.innerWidth < 1 ||
    !Number.isSafeInteger(viewport.innerHeight) || viewport.innerHeight < 1 ||
    !Number.isSafeInteger(viewport.devicePixelRatio) ||
    viewport.devicePixelRatio < 1 || viewport.devicePixelRatio > 4 ||
    (expectedChallengeHash !== null && !HASH.test(expectedChallengeHash ?? ""))
  ) jpegFail("Browser screenshot is not a bounded JPEG or viewport is invalid.");

  let offset = 2;
  let markerCount = 0;
  let jfif = null;
  let frame = null;
  let scanComponents = null;
  let entropyStart = null;
  let iccProfileCount = null;
  let iccProfileBytes = 0;
  const iccProfileSegments = new Map();
  const quantizationTables = new Map();
  const huffmanTables = new Map();
  while (offset < bytes.length) {
    if (
      offset + 4 > bytes.length || bytes[offset] !== 0xff ||
      bytes[offset + 1] === 0xff || bytes[offset + 1] === 0x00
    ) jpegFail("JPEG marker bytes are not exact.");
    const marker = bytes[offset + 1];
    if (marker === 0xd9) jpegFail("JPEG EOI appears before its scan.");
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      jpegFail("JPEG contains a forbidden standalone marker.");
    }
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) jpegFail("JPEG segment length is invalid.");
    const data = bytes.subarray(offset + 4, end);
    markerCount += 1;
    if (marker === 0xe0) {
      const signature = [0x4a, 0x46, 0x49, 0x46, 0x00];
      if (
        markerCount !== 1 || jfif !== null || data.length !== 14 ||
        !exactBytes(Array.from(data.subarray(0, 5)), signature) ||
        data[5] !== 1 || data[6] !== 1 || data[7] !== 0 ||
        data.readUInt16BE(8) !== 1 || data.readUInt16BE(10) !== 1 ||
        data[12] !== 0 || data[13] !== 0
      ) jpegFail("JPEG APP0 is not exact JFIF 1.01 density 1x1.");
      jfif = Object.freeze({ version: "1.01" });
    } else if (marker === 0xe2) {
      const signature = [
        0x49, 0x43, 0x43, 0x5f, 0x50, 0x52,
        0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00
      ];
      const sequence = data[12];
      const count = data[13];
      const payloadLength = data.length - 14;
      if (
        jfif === null || quantizationTables.size > 0 || data.length < 15 ||
        !exactBytes(Array.from(data.subarray(0, 12)), signature) ||
        count < 1 || count > 16 || sequence < 1 || sequence > count ||
        (iccProfileCount !== null && iccProfileCount !== count) ||
        iccProfileSegments.has(sequence) || payloadLength < 1 ||
        iccProfileBytes + payloadLength > MAXIMUM_ICC_PROFILE_BYTES
      ) jpegFail("JPEG ICC_PROFILE APP2 sequence is invalid.");
      iccProfileCount = count;
      iccProfileBytes += payloadLength;
      iccProfileSegments.set(sequence, true);
    } else if (marker === 0xdb) {
      if (jfif === null || frame !== null || huffmanTables.size > 0) {
        jpegFail("JPEG DQT order is invalid.");
      }
      parseJpegQuantizationTables(data, quantizationTables);
    } else if (marker === 0xc0) {
      if (
        jfif === null || frame !== null ||
        quantizationTables.size !== 2 || huffmanTables.size > 0
      ) jpegFail("JPEG SOF0 order is invalid.");
      frame = parseJpegFrame(data);
    } else if (marker === 0xc4) {
      if (frame === null || scanComponents !== null) {
        jpegFail("JPEG DHT order is invalid.");
      }
      parseJpegHuffmanTables(data, huffmanTables);
    } else if (marker === 0xda) {
      if (
        frame === null || scanComponents !== null ||
        huffmanTables.size !== 4 ||
        !["0:0", "1:0", "0:1", "1:1"].every((key) => huffmanTables.has(key))
      ) jpegFail("JPEG SOS appears before the exact tables are complete.");
      scanComponents = parseJpegScanHeader(data, frame);
      entropyStart = end;
      offset = end;
      break;
    } else if (marker === 0xdd) {
      jpegFail("JPEG DRI and restart intervals are unsupported and forbidden.");
    } else if (marker === 0xc2) {
      jpegFail("Progressive JPEG is forbidden; SOF0 baseline is required.");
    } else {
      jpegFail("JPEG contains an unknown or forbidden marker.");
    }
    offset = end;
  }
  if (
    jfif === null || frame === null || scanComponents === null ||
    entropyStart === null ||
    (iccProfileCount !== null && (
      iccProfileSegments.size !== iccProfileCount ||
      Array.from({ length: iccProfileCount }, (_, index) => index + 1)
        .some((sequence) => !iccProfileSegments.has(sequence))
    ))
  ) jpegFail("JPEG baseline structure is incomplete.");
  const expectedWidth = viewport.innerWidth * viewport.devicePixelRatio;
  const expectedHeight = viewport.innerHeight * viewport.devicePixelRatio;
  if (frame.width !== expectedWidth || frame.height !== expectedHeight) {
    jpegFail("JPEG dimensions do not bind the measured viewport.");
  }
  const entropyEnd = findJpegEntropyEnd(bytes, entropyStart);
  const reader = createJpegEntropyReader(bytes, entropyStart, entropyEnd);
  const horizontalMcuCount = Math.ceil(frame.width / 16);
  const verticalMcuCount = Math.ceil(frame.height / 16);
  const mcuCount = horizontalMcuCount * verticalMcuCount;
  if (
    !Number.isSafeInteger(mcuCount) ||
    mcuCount > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumMcuCount
  ) {
    jpegFail("JPEG MCU count is oversized.");
  }
  const predictors = new Map(scanComponents.map(({ id }) => [id, 0]));
  const challenge = createPixelChallengeCollector(viewport.devicePixelRatio);
  for (let mcuY = 0; mcuY < verticalMcuCount; mcuY += 1) {
    for (let mcuX = 0; mcuX < horizontalMcuCount; mcuX += 1) {
      for (const component of scanComponents) {
        const dcTable = huffmanTables.get(`0:${component.dcTableId}`);
        const acTable = huffmanTables.get(`1:${component.acTableId}`);
        for (let vertical = 0; vertical < component.verticalSampling; vertical += 1) {
          for (let horizontal = 0; horizontal < component.horizontalSampling; horizontal += 1) {
            const decoded = decodeJpegBlock(
              reader,
              dcTable,
              acTable,
              predictors.get(component.id)
            );
            predictors.set(component.id, decoded.dc);
            if (component.id === 1) {
              challenge.observe({
                blockX: mcuX * 2 + horizontal,
                blockY: mcuY * 2 + vertical,
                dc: decoded.dc,
                acAllZero: decoded.acAllZero,
                dcQuantizer: quantizationTables.get(0)[0]
              });
            }
          }
        }
      }
    }
  }
  reader.assertComplete();
  const decodedChallengeHash = decodeM1BOperationalBrowserPixelChallenge(
    challenge.bits()
  );
  if (
    expectedChallengeHash !== null &&
    decodedChallengeHash !== expectedChallengeHash
  ) jpegFail("JPEG pixel challenge does not bind the expected prompt.");
  return Object.freeze({
    width: frame.width,
    height: frame.height,
    jfifVersion: jfif.version,
    iccProfileSegmentCount: iccProfileSegments.size,
    iccProfileBytes,
    quality: 80,
    subsampling: "4:2:0",
    mcuCount,
    decodedChallengeHash,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}
