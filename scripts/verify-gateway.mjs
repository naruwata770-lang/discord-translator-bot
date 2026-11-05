#!/usr/bin/env node
/**
 * Vercel AI Gateway 実接続チェック
 *
 * 1. GET {AI_GATEWAY_BASE_URL}/models で AI_MODEL_NAME が一覧にあるか確認
 * 2. ビルド済みの AiGatewayClient で「言語検出 → 日→中 → 中→日」の1往復を実行
 *
 * 本物のAPIを呼ぶので AI_GATEWAY_API_KEY が必要（.env か環境変数で渡す）。
 * 使い方: npm run build && npm run verify:gateway
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require('dotenv').config({ path: join(root, '.env') });

const clientPath = join(root, 'dist', 'services', 'aiGatewayClient.js');
if (!existsSync(clientPath)) {
  console.error(`❌ ${clientPath} がありません。先に npm run build を実行してください。`);
  process.exit(1);
}

const apiKey = process.env.AI_GATEWAY_API_KEY;
const baseUrl = (process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1').replace(/\/+$/, '');
const model = process.env.AI_MODEL_NAME || 'openai/gpt-5.4-mini';

if (!apiKey) {
  console.error('❌ AI_GATEWAY_API_KEY が設定されていません。');
  process.exit(1);
}

let failed = false;
const ok = (msg) => console.log(`✅ ${msg}`);
const ng = (msg) => {
  failed = true;
  console.error(`❌ ${msg}`);
};

console.log(`接続先: ${baseUrl}`);
console.log(`モデル: ${model}\n`);

// 1. モデル一覧
try {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    ng(`GET /models が ${res.status} を返しました: ${await res.text()}`);
  } else {
    const { data } = await res.json();
    const ids = data.map((m) => m.id);
    if (ids.includes(model)) {
      ok(`/models に ${model} があります（全 ${ids.length} モデル）`);
    } else {
      const prefix = model.split('/')[0];
      ng(`/models に ${model} がありません。同じ提供元の候補: ${ids.filter((id) => id.startsWith(`${prefix}/`)).join(', ')}`);
    }
  }
} catch (error) {
  ng(`GET /models に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
}

// 2. 翻訳1往復（botと同じクライアントを使う）
const { AiGatewayClient } = require(clientPath);
const client = new AiGatewayClient(apiKey, baseUrl, model);
const source = 'こんにちは！今夜一緒にゲームしない？';

try {
  const detectedJa = await client.detectLanguage(source);
  if (detectedJa === 'ja') ok(`言語検出: 「${source}」→ ${detectedJa}`);
  else ng(`言語検出: 「${source}」が ja ではなく ${detectedJa} と判定されました`);

  const zh = await client.translate(source, 'ja', 'zh');
  ok(`日→中: ${source} → ${zh}`);

  const detectedZh = await client.detectLanguage(zh);
  if (detectedZh === 'zh') ok(`言語検出: 「${zh}」→ ${detectedZh}`);
  else ng(`言語検出: 「${zh}」が zh ではなく ${detectedZh} と判定されました`);

  const ja = await client.translate(zh, 'zh', 'ja');
  ok(`中→日: ${zh} → ${ja}`);
} catch (error) {
  ng(`翻訳呼び出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(failed ? '\n❌ 確認失敗' : '\n✅ AI Gateway で日⇔中の1往復が通りました');
process.exit(failed ? 1 : 0);
