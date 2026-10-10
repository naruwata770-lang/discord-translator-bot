#!/usr/bin/env node
/**
 * 起動スモークテスト
 *
 * ビルド済みの dist/index.js をダミーの認証情報で起動し、
 * 「設定の読み込み → 辞書(dictionaries/strinova.yaml)のロード → Discordログイン試行」
 * まで落ちずに到達することをログから確認する。
 *
 * ダミートークンなのでログイン自体は失敗するのが正常。
 * それ以前の段階（設定・辞書・依存関係の配線）で壊れていないかを見る。
 *
 * 使い方: npm run build && node scripts/smoke-test.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist', 'index.js');
const TIMEOUT_MS = 30_000;

// ここまで到達していれば起動処理は正常
const REQUIRED = [
  'Configuration loaded successfully',
  'Dictionary service initialized',
  'Attempting to login to Discord',
];
// 出てはいけないログ
const FORBIDDEN = [
  'Configuration validation failed',
  'Dictionary service not available',
  'Uncaught exception',
  'Unhandled rejection',
];

if (!existsSync(entry)) {
  console.error(`❌ ${entry} がありません。先に npm run build を実行してください。`);
  process.exit(1);
}

const child = spawn(process.execPath, [entry], {
  cwd: root,
  env: {
    PATH: process.env.PATH,
    // productionにするとpinoがJSON1行ずつで出力するので機械的に読める
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    DISCORD_BOT_TOKEN: 'smoke-test-dummy-token',
    POE_API_KEY: 'smoke-test-dummy-key',
    POE_ENDPOINT_URL: 'http://127.0.0.1:9/v1/chat/completions',
    TARGET_CHANNELS: '000000000000000000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const messages = [];
let buffer = '';
let finished = false;

function onLine(line) {
  if (!line.trim()) return;
  try {
    const log = JSON.parse(line);
    if (typeof log.msg === 'string') messages.push(log.msg);
  } catch {
    // JSONでない出力（discord.jsの警告など）はそのまま表示だけする
  }
  console.log(line);
  // ログイン試行まで来たら目的は達成しているので止める
  if (line.includes('Attempting to login to Discord')) {
    setTimeout(() => finish('ログイン試行まで到達'), 3_000);
  }
}

function handleChunk(chunk) {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  lines.forEach(onLine);
}

child.stdout.on('data', handleChunk);
child.stderr.on('data', handleChunk);
child.on('close', (code) => finish(`プロセス終了 (exit ${code})`));

const timer = setTimeout(() => finish('タイムアウト'), TIMEOUT_MS);

function finish(reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (buffer) onLine(buffer);
  if (child.exitCode === null) child.kill('SIGKILL');

  const missing = REQUIRED.filter((m) => !messages.includes(m));
  const forbidden = FORBIDDEN.filter((m) => messages.includes(m));

  console.log(`\n--- スモークテスト結果 (${reason}) ---`);
  for (const m of REQUIRED) {
    console.log(`${missing.includes(m) ? '❌' : '✅'} ${m}`);
  }
  for (const m of forbidden) {
    console.log(`❌ 想定外のログ: ${m}`);
  }

  if (missing.length > 0 || forbidden.length > 0) {
    console.error('❌ 起動スモークテスト失敗');
    process.exit(1);
  }
  console.log('✅ 起動スモークテスト成功');
  process.exit(0);
}
