# src/engine — the cordoned WebGPU engine (Emberglass lineage)

The pure WebGPU inference + LoRA-training runtime for VibeThinker-3B /
Qwen2.5-class models. This directory is deliberately **segmented from the
app** so it can be extracted into its own repo later without surgery.
`bun run check:engine-boundary` enforces the seam.

## Boundary rules (mechanically enforced)

1. Nothing in here imports app code (`@/`, `~/`, or relative paths escaping
   `src/engine`). The engine is plain JS with zero app dependencies.
2. App code touches the engine only through two seam files:
   - `src/lib/runtime/weight-fetch.ts` — inference (loads
     `emberglass_bridge.js`)
   - `src/lib/agents/train-runtime.ts` — training (TrainingController, GRPO,
     LoRA export)
   Tests may import engine internals directly.

## Provenance

Lineage: `vibethinker-webgpu-lora` -> `emberglass` -> vendored here
(both ancestors archived 2026-07-06 to `~/_archive/` and GitHub). The
generated kernel modules are byte-identical across all three copies
(sha256 of `qwgpu/kernels.js` / `qwgpu/backward_kernels.js` minus the
16-line generated header: `e4d17a6c…` / `88b3540…`), so all the kernel
optimization work — 103 `immediate` address-space uses, 22
`enable subgroups` shaders, dp4a W4A8 paths, f16 variants — lives here.
This copy is ahead of the ancestors in the wrapper layer only: row-sliced
streaming weight load + quantization (12GB-phone OOM fix), the GRPO
per-token float-advantage hook in `qwgpu/trainer.js` +
`services/grpo_controller.js`, `qwgpu/quantize.test.js`, and removal of the
mock-weights branch.

## Layout

- `emberglass_bridge.js` — public API (`createEmberglassEngine`,
  chat-completions shape)
- `qwgpu/` — runtime, kernels, trainer, quantizer, safetensors loader;
  WGSL sources in `qwgpu/templates/{forward,backward}/`
- `services/` — model session, training controller, GRPO controller
- Kernel modules are generated: edit `qwgpu/templates/*`, then
  `bun run kernels:generate`; `bun run kernels:check` verifies sync.

## Extracting to a standalone repo later

The boundary means extraction is mechanical: copy `src/engine/` out, publish
its two seam surfaces (`emberglass_bridge.js`, the `services/` controllers)
as the package API, point the two seam files at the package. Nothing else in
the app knows the engine exists.
