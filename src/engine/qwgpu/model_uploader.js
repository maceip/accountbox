/*
 *   ,;
 *  \@@#\:          :/.        .:;;:
 * _@@@@@@#+\|/!;;!-@@@--;    ,@@@@@;
 * .!_*@@@@@@@@@@@@@@@@@@@;   |@@@@@\
 *     .:!|+@@@@@##@@@@@@@#!  -@@@@@#,
 *         .\@@@*;,\@@@@@@@@+,*@@@@@@+.
 *     :*#@@@@@@@@@@@@@@-+@@@@@@@\@@@@-.
 *     .#@@@@@#@@@@#*@@@+ /@@@@@@;\@@@@+.
 *      ;\/:,  -@@@@;|@@@\ ,+@@@@!.+@@@@*:
 *             ,@@@@#*@@@@@#+__!.  ,*@@@@@/
 *              \##+_@@@@@@@@,      ,+@@@_:
 *                   ;;,,..,:         !;.
 */

// Schema-driven upload/quantization decisions for QwenWGPU. The uploader is
// deliberately tiny: it consumes one decoded tensor at a time and never stores
// the decoded Float32Array after the quantized/f32 GPU buffers have been made.

/*
 * TECHNIQUE: Streaming visit + release during model load
 *   Each tensor is quantized/uploaded immediately and the JS Float32Array
 *   is dropped. Combined with the streaming loader, peak JS memory stays low.
 */
import {
  quantizeInt8RowMajor,
  quantizeInt4Group,
  quantizeInt8RowsInto,
  quantizeInt4GroupRowsInto,
} from './quantize.js';

export class ModelUploader {
  constructor({ schema, q, q4, bufs, uploadF32, uploadU32, groupSize = 128 }) {
    this.schema = schema;
    this.q = q;
    this.q4 = q4;
    this.bufs = bufs;
    this.uploadF32 = uploadF32;
    this.uploadU32 = uploadU32;
    this.groupSize = groupSize;
    this.seen = new Set();
  }

  async visit({ name, shape, data, readRows, rowsPerChunk }) {
    const desc = this.schema.validateTensor(name, shape);
    if (!desc) return;
    if (this.seen.has(name)) throw new Error(`duplicate tensor ${name}`);

    if (readRows) {
      // Row-sliced path for oversized tensors (see safetensors_loader):
      // quantize slice by slice into whole-tensor outputs; bit-identical to
      // the whole-tensor path because rows/groups never span slices.
      const [outDim, inDim] = shape;
      if (desc.quant === 'int8') {
        const packed = new Uint32Array((outDim * inDim) / 4);
        const scale = new Float32Array(outDim);
        for (let r = 0; r < outDim; r += rowsPerChunk) {
          const rEnd = Math.min(outDim, r + rowsPerChunk);
          quantizeInt8RowsInto(await readRows(r, rEnd), r, rEnd - r, inDim, packed, scale);
        }
        this.q[name] = { w: this.uploadU32(packed), scale: this.uploadF32(scale), N: outDim, K: inDim };
      } else if (desc.quant === 'int4') {
        const groupsPerRow = inDim / this.groupSize;
        const packed = new Uint32Array((outDim * inDim) / 8);
        const scale = new Float32Array(outDim * groupsPerRow);
        for (let r = 0; r < outDim; r += rowsPerChunk) {
          const rEnd = Math.min(outDim, r + rowsPerChunk);
          quantizeInt4GroupRowsInto(await readRows(r, rEnd), r, rEnd - r, inDim, this.groupSize, packed, scale);
        }
        this.q4[name] = {
          w: this.uploadU32(packed),
          scale: this.uploadF32(scale),
          N: outDim,
          K: inDim,
          gpr: groupsPerRow,
          desc,
        };
      } else {
        // f32-mode tensors are small norm vectors; they never take this path.
        throw new Error(`sliced load unsupported for quant mode ${desc.quant} (${name})`);
      }
      this.seen.add(name);
      return;
    }

    if (desc.quant === 'int8') {
      const { packed, scale } = quantizeInt8RowMajor(data, shape[0], shape[1]);
      this.q[name] = { w: this.uploadU32(packed), scale: this.uploadF32(scale), N: shape[0], K: shape[1] };
    } else if (desc.quant === 'int4') {
      const { packed, scale, groupsPerRow } = quantizeInt4Group(data, shape[0], shape[1], this.groupSize);
      this.q4[name] = {
        w: this.uploadU32(packed),
        scale: this.uploadF32(scale),
        N: shape[0],
        K: shape[1],
        gpr: groupsPerRow,
        desc,
      };
    } else if (desc.quant === 'f32') {
      this.bufs[name] = this.uploadF32(data);
    } else {
      throw new Error(`unsupported quant mode ${desc.quant} for ${name}`);
    }
    this.seen.add(name);
  }

  finalize() {
    this.schema.assertComplete(this.seen);
  }
}
