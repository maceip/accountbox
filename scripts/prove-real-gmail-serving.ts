#!/usr/bin/env bun
/**
 * Mechanical proof for the trained/tuned Gmail agent serving platform.
 * This does what is possible from Node: file + contract checks.
 * Full proof (real weights → non-__cold plan) requires the browser + WebGPU.
 *
 * Run: bun run scripts/prove-real-gmail-serving.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ADAPTER_DIR = join(ROOT, 'public/adapters/gmail-agent');
const RUNTIME = join(ROOT, 'src/lib/runtime/gmail-agent-runtime.ts');

console.log('=== Prove: trained/tuned model serving platform ===\n');

let ok = true;

function check(name: string, cond: boolean, failMsg?: string) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ ${name}${failMsg ? ' — ' + failMsg : ''}`);
    ok = false;
  }
}

// 1. Adapter files present (what the browser will fetch)
const cfg = join(ADAPTER_DIR, 'adapter_config.json');
const weights = join(ADAPTER_DIR, 'adapters.safetensors');
check('adapter_config.json served', existsSync(cfg));
check('adapters.safetensors served', existsSync(weights));
if (existsSync(weights)) {
  const { statSync } = await import('node:fs');
  const sz = statSync(weights).size;
  check('adapter weights > 50MB', sz > 50 * 1024 * 1024, `size=${(sz/1024/1024).toFixed(0)}MB`);
}

// 2. Runtime contract (the serving code)
const src = readFileSync(RUNTIME, 'utf8');
check('FIXED_SYSTEM_PROMPT present', src.includes('FIXED_SYSTEM_PROMPT'));
check('generate enforces equipped state', src.includes("!== 'equipped'") || src.includes('!== "equipped"'));
check('cold path returns __cold', src.includes('__cold: true'));
check('calls createEmberglassEngine', src.includes('createEmberglassEngine'));
check('supports loraUrl', src.includes('loraUrl'));
check('isEquippedForRealInference exported', src.includes('export function isEquippedForRealInference'));

// 3. Chat uses the real surface only
const chat = readFileSync(join(ROOT, 'src/components/chat/local-chat.tsx'), 'utf8');
check('chat imports from gmail-agent-runtime only', chat.includes('from "@/lib/runtime/gmail-agent-runtime"'));
check('chat distinguishes REAL vs COLD', chat.includes('isCold') || chat.includes('isReal'));
check('chat refuses cold execution', chat.includes('refusing execution') || chat.includes('__cold'));

console.log('\n' + (ok ? 'PASS (files + contract)' : 'FAIL — see above'));
console.log('Real end-to-end (weights → non-cold plan) still requires: bun run dev in browser with WebGPU + click "Load real LoRA"');
process.exit(ok ? 0 : 1);
