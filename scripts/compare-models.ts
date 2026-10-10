/**
 * Poeモデル比較スクリプト
 *
 * 本番と同じ PoeApiClient（同じプロンプト）で、複数モデルの翻訳結果と
 * 言語検出結果を並べてMarkdownに出力する。
 *
 * 使い方:
 *   POE_API_KEY=xxx LOG_LEVEL=silent npx ts-node --transpile-only scripts/compare-models.ts
 *   （モデルを変える場合: MODELS=gpt-5.4-nano,claude-haiku-5.5 を指定）
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { PoeApiClient } from '../src/services/poeApiClient';

const DEFAULT_MODELS = [
  'gpt-5.4-nano',
  'claude-haiku-5.5',
  'qwen3.5-flash-el',
  'gemini-3.1-flash-lite',
];

// 本番と同じ組み合わせ: 日本語→中国語+英語、中国語→日本語+英語
const SAMPLES: Array<{ lang: 'ja' | 'zh'; text: string }> = [
  { lang: 'ja', text: 'おはよう！昨日は遅くまでありがとうね' },
  { lang: 'ja', text: '今日めっちゃ暑くない？溶けそうｗｗ' },
  { lang: 'ja', text: 'それな〜わかる' },
  { lang: 'ja', text: '週末ひま？一緒にランクマ回そうよ' },
  { lang: 'ja', text: 'ごめん、今ちょっと手が離せないから後で返すね🙏' },
  { lang: 'ja', text: 'このラーメン屋、まじでおすすめ。替え玉無料だし' },
  { lang: 'ja', text: '推しが尊すぎて無理…' },
  { lang: 'ja', text: '中国の旅行でどこ行けばいいか教えてほしい！' },
  { lang: 'ja', text: 'さっきのボス戦、あと少しで勝てたのに草' },
  { lang: 'ja', text: '気にしないで、全然大丈夫だよ' },
  { lang: 'zh', text: '早上好！昨天玩得太开心了哈哈' },
  { lang: 'zh', text: '今天加班到十点，累死了' },
  { lang: 'zh', text: '这个游戏真的绝绝子，yyds' },
  { lang: 'zh', text: '你周末有空吗？一起开黑吧' },
  { lang: 'zh', text: '我刚才说错了，别在意哈' },
  { lang: 'zh', text: '日本的便利店也太方便了吧，羡慕' },
  { lang: 'zh', text: '笑死，他又迟到了' },
  { lang: 'zh', text: '这道菜看起来好好吃，求做法！' },
  { lang: 'zh', text: '下次来上海的话我请你吃小笼包' },
  { lang: 'zh', text: '没事没事，慢慢来不着急' },
];

interface Cell {
  text: string;
  ms: number;
}

async function timed(fn: () => Promise<string>): Promise<Cell> {
  const start = Date.now();
  try {
    const text = await fn();
    return { text, ms: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { text: `❌ ${message.slice(0, 200)}`, ms: Date.now() - start };
  }
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

async function main(): Promise<void> {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) {
    console.error('POE_API_KEY が設定されていません');
    process.exit(1);
  }
  const endpoint = process.env.POE_ENDPOINT_URL || 'https://api.poe.com/v1/chat/completions';
  const models = (process.env.MODELS || DEFAULT_MODELS.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const lines: string[] = [];
  const stats: Record<string, { ms: number[]; errors: number; detectOk: number }> = {};
  for (const model of models) stats[model] = { ms: [], errors: 0, detectOk: 0 };

  lines.push(`# Poeモデル比較 (${new Date().toISOString()})`, '');
  lines.push(`モデル: ${models.join(', ')}`, '');

  for (const [i, sample] of SAMPLES.entries()) {
    const targets = sample.lang === 'ja' ? ['zh', 'en'] : ['ja', 'en'];
    console.error(`[${i + 1}/${SAMPLES.length}] ${sample.text}`);

    lines.push(`## ${i + 1}. (${sample.lang}) ${sample.text}`, '');
    lines.push(`| モデル | 言語検出 | ${targets.join(' | ')} |`);
    lines.push(`|---|---|${targets.map(() => '---').join('|')}|`);

    for (const model of models) {
      const client = new PoeApiClient(apiKey, endpoint, model);
      const [detect, ...translations] = await Promise.all([
        timed(() => client.detectLanguage(sample.text)),
        ...targets.map((t) => timed(() => client.translate(sample.text, sample.lang, t))),
      ]);

      if (detect.text === sample.lang) stats[model].detectOk++;
      for (const cell of [detect, ...translations]) {
        if (cell.text.startsWith('❌')) stats[model].errors++;
      }
      for (const cell of translations) stats[model].ms.push(cell.ms);

      const detectCell = detect.text === sample.lang ? `✅ ${detect.text}` : escapeCell(detect.text);
      const translationCells = translations.map((c) => `${escapeCell(c.text)} (${c.ms}ms)`);
      lines.push(`| ${model} | ${detectCell} | ${translationCells.join(' | ')} |`);
    }
    lines.push('');
  }

  lines.push('## まとめ', '');
  lines.push('| モデル | 言語検出 正解 | エラー数 | 翻訳の平均応答時間 |');
  lines.push('|---|---|---|---|');
  for (const model of models) {
    const s = stats[model];
    const avg = s.ms.length ? Math.round(s.ms.reduce((a, b) => a + b, 0) / s.ms.length) : 0;
    lines.push(`| ${model} | ${s.detectOk}/${SAMPLES.length} | ${s.errors} | ${avg}ms |`);
  }

  const outPath = process.env.OUT || 'model-comparison.md';
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.error(`結果を ${outPath} に出力しました`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
