// Sliced (streaming) quantization must be bit-identical to the whole-tensor
// path — this is what lets the loader stream the 0.6GB embedding table in
// 32MB windows on phones without changing model output at all.
import { describe, expect, test } from "bun:test";
import {
  quantizeInt8RowMajor,
  quantizeInt8RowsInto,
  quantizeInt4Group,
  quantizeInt4GroupRowsInto,
} from "./quantize.js";
import { ModelUploader } from "./model_uploader.js";

function randomMatrix(outDim, inDim, seed = 42) {
  // Deterministic LCG so failures reproduce.
  let s = seed >>> 0;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
  const m = new Float32Array(outDim * inDim);
  for (let i = 0; i < m.length; i++) m[i] = (next() - 0.5) * 4;
  return m;
}

const OUT = 64;
const IN = 32; // multiple of 8, several int4 groups per row at group=8

describe("sliced quantization equals whole-tensor quantization", () => {
  test("int8, uneven slice sizes", () => {
    const f32 = randomMatrix(OUT, IN);
    const whole = quantizeInt8RowMajor(f32, OUT, IN);
    const packed = new Uint32Array((OUT * IN) / 4);
    const scale = new Float32Array(OUT);
    for (let r = 0; r < OUT; r += 5) {
      const rEnd = Math.min(OUT, r + 5); // 64 % 5 != 0 → exercises last partial slice
      quantizeInt8RowsInto(f32.subarray(r * IN, rEnd * IN), r, rEnd - r, IN, packed, scale);
    }
    expect(packed).toEqual(whole.packed);
    expect(scale).toEqual(whole.scale);
  });

  test("int4, uneven slice sizes", () => {
    const f32 = randomMatrix(OUT, IN, 7);
    const group = 8;
    const whole = quantizeInt4Group(f32, OUT, IN, group);
    const packed = new Uint32Array((OUT * IN) / 8);
    const scale = new Float32Array(OUT * (IN / group));
    for (let r = 0; r < OUT; r += 7) {
      const rEnd = Math.min(OUT, r + 7);
      quantizeInt4GroupRowsInto(f32.subarray(r * IN, rEnd * IN), r, rEnd - r, IN, group, packed, scale);
    }
    expect(packed).toEqual(whole.packed);
    expect(scale).toEqual(whole.scale);
  });
});

describe("ModelUploader sliced visit", () => {
  function makeUploader(quant, uploads) {
    return new ModelUploader({
      schema: { validateTensor: () => ({ quant }) },
      q: {},
      q4: {},
      bufs: {},
      uploadF32: (arr) => (uploads.push(arr.slice()), "f32buf"),
      uploadU32: (arr) => (uploads.push(arr.slice()), "u32buf"),
      groupSize: 8,
    });
  }

  test("readRows path produces the same uploads as the data path (int8)", async () => {
    const f32 = randomMatrix(OUT, IN, 3);
    const wholeUploads = [];
    const whole = makeUploader("int8", wholeUploads);
    await whole.visit({ name: "w", shape: [OUT, IN], data: f32 });

    const slicedUploads = [];
    const sliced = makeUploader("int8", slicedUploads);
    await sliced.visit({
      name: "w",
      shape: [OUT, IN],
      readRows: async (r0, r1) => f32.subarray(r0 * IN, r1 * IN),
      rowsPerChunk: 9,
    });

    expect(slicedUploads).toEqual(wholeUploads);
    expect(sliced.q.w.N).toBe(OUT);
    expect(sliced.q.w.K).toBe(IN);
  });

  test("readRows path produces the same uploads as the data path (int4)", async () => {
    const f32 = randomMatrix(OUT, IN, 11);
    const wholeUploads = [];
    const whole = makeUploader("int4", wholeUploads);
    await whole.visit({ name: "w", shape: [OUT, IN], data: f32 });

    const slicedUploads = [];
    const sliced = makeUploader("int4", slicedUploads);
    await sliced.visit({
      name: "w",
      shape: [OUT, IN],
      readRows: async (r0, r1) => f32.subarray(r0 * IN, r1 * IN),
      rowsPerChunk: 13,
    });

    expect(slicedUploads).toEqual(wholeUploads);
    expect(sliced.q4.w.gpr).toBe(IN / 8);
  });

  test("readRows on an f32-mode tensor is refused", async () => {
    const uploader = makeUploader("f32", []);
    await expect(
      uploader.visit({
        name: "norm",
        shape: [OUT, IN],
        readRows: async () => new Float32Array(IN),
        rowsPerChunk: 8,
      }),
    ).rejects.toThrow("sliced load unsupported");
  });
});
