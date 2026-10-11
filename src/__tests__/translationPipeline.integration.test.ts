/**
 * 翻訳パイプライン結合テスト
 *
 * Discordメッセージ受信 → 言語検出 → 辞書マッチ → Poe API呼び出し → Discordへの返信
 * までを、本物のクラス群と本物の辞書（dictionaries/strinova.yaml）で通しで検証する。
 *
 * 外部サービスだけを偽物に差し替える:
 * - Poe API: ローカルに立てたHTTPサーバー（POE_ENDPOINT_URL相当の差し替え）
 * - Discord: Messageオブジェクトの最小限のスタブ
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import type { Message } from 'discord.js';
import { MessageHandler } from '../discord/messageHandler';
import { MessageDispatcher } from '../discord/messageDispatcher';
import { CommandParser } from '../commands/commandParser';
import { TranslationService } from '../services/translationService';
import { PoeApiClient } from '../services/poeApiClient';
import { LanguageDetector } from '../services/languageDetector';
import { RateLimiter } from '../services/rateLimiter';
import { DictionaryService } from '../services/dictionaryService';

// ログ出力はテスト対象外なので黙らせる
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const TARGET_CHANNEL = 'channel-target';
const API_KEY = 'test-poe-key';
const MODEL = 'test-model';

interface PoeRequest {
  authorization: string | undefined;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
  };
}

type PoeReply = { status: number; content?: string };
type PoeResponder = (req: PoeRequest) => PoeReply;

// ---- 偽Poeサーバー ----

const LANG_NAMES: Record<string, string> = {
  Japanese: 'ja',
  Chinese: 'zh',
  English: 'en',
};

/** 言語検出リクエストかどうか（systemメッセージ付きで送られる） */
function isDetectionRequest(req: PoeRequest): boolean {
  return req.body.messages.some((m) => m.role === 'system');
}

/** 翻訳プロンプトから翻訳先言語を取り出す */
function targetLangOf(req: PoeRequest): string {
  const prompt = req.body.messages[req.body.messages.length - 1].content;
  const match = prompt.match(/from (\w+) to (\w+)/);
  if (!match) throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
  return LANG_NAMES[match[2]];
}

/** 翻訳プロンプトの本文を取り出す */
function promptOf(req: PoeRequest): string {
  return req.body.messages[req.body.messages.length - 1].content;
}

let server: http.Server;
let endpointUrl: string;
let requests: PoeRequest[];
let responder: PoeResponder;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on('end', () => {
      const poeReq: PoeRequest = {
        authorization: req.headers.authorization,
        body: JSON.parse(raw) as PoeRequest['body'],
      };
      requests.push(poeReq);
      const reply = responder(poeReq);
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      if (reply.status >= 400) {
        res.end(JSON.stringify({ error: { message: 'mock error' } }));
      } else {
        res.end(
          JSON.stringify({ choices: [{ message: { content: reply.content } }] })
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  endpointUrl = `http://127.0.0.1:${port}/v1/chat/completions`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---- Discordスタブ ----

interface FakeMessage {
  message: Message;
  reply: jest.Mock;
  send: jest.Mock;
}

function createMessage(
  content: string,
  options: { channelId?: string; bot?: boolean } = {}
): FakeMessage {
  const reply = jest.fn().mockResolvedValue({});
  const send = jest.fn().mockResolvedValue({});
  const message = {
    id: 'message-1',
    content,
    cleanContent: content,
    channelId: options.channelId ?? TARGET_CHANNEL,
    author: { id: 'user-1', bot: options.bot ?? false },
    attachments: { size: 0 },
    embeds: [],
    channel: { isThread: () => false, send },
    reply,
  } as unknown as Message;
  return { message, reply, send };
}

// ---- 本物のパイプラインを組み立てる（src/index.tsと同じ配線） ----

function createPipeline(): MessageHandler {
  const dictionaryService = new DictionaryService();
  dictionaryService.loadDictionary(
    path.join(__dirname, '../../dictionaries/strinova.yaml')
  );
  const translationService = new TranslationService(
    new PoeApiClient(API_KEY, endpointUrl, MODEL),
    new LanguageDetector(),
    new RateLimiter(5, 0),
    true, // 本番と同じくAI言語検出を有効にする
    dictionaryService
  );
  return new MessageHandler(
    new CommandParser(),
    translationService,
    new MessageDispatcher(),
    [TARGET_CHANNEL]
  );
}

/** 正常系の偽Poe: 検出は文字種で判定し、翻訳は言語ごとに固定文を返す */
function happyResponder(translations: Record<string, string>): PoeResponder {
  return (req) => {
    if (isDetectionRequest(req)) {
      // 検出プロンプト自体が日本語なので、"""で囲まれた判定対象部分だけを見る
      const text = promptOf(req).split('"""')[1] ?? '';
      return { status: 200, content: /[぀-ヿ]/.test(text) ? 'ja' : 'zh' };
    }
    return { status: 200, content: translations[targetLangOf(req)] };
  };
}

beforeEach(() => {
  requests = [];
});

describe('翻訳パイプライン結合テスト', () => {
  it('日本語メッセージを中国語と英語に翻訳して返信する（辞書の用語がプロンプトに入る）', async () => {
    responder = happyResponder({ zh: '我想用心夏。', en: 'I want to use Kokona.' });
    const handler = createPipeline();
    const { message, reply, send } = createMessage('ココナを使いたい');

    await handler.handle(message);

    // Poeへのリクエスト: 言語検出1回 + 翻訳2回
    expect(requests).toHaveLength(3);
    expect(requests.every((r) => r.authorization === `Bearer ${API_KEY}`)).toBe(true);
    expect(requests.every((r) => r.body.model === MODEL)).toBe(true);

    const translationReqs = requests.filter((r) => !isDetectionRequest(r));
    const zhReq = translationReqs.find((r) => targetLangOf(r) === 'zh');
    const enReq = translationReqs.find((r) => targetLangOf(r) === 'en');
    expect(zhReq).toBeDefined();
    expect(enReq).toBeDefined();
    // 本物の辞書から用語ヒントが生成されている
    expect(promptOf(zhReq!)).toContain('ココナ → 心夏');
    expect(promptOf(enReq!)).toContain('ココナ → Kokona');
    expect(promptOf(zhReq!)).toContain('ココナを使いたい');

    // Discordへの返信
    expect(send).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(1);
    const [{ content, allowedMentions }] = reply.mock.calls[0] as [
      { content: string; allowedMentions: unknown },
    ];
    expect(content).toBe(
      '💬 **原文**\nココナを使いたい\n\n' +
        '🇨🇳 **中文**\n我想用心夏。\n\n' +
        '🇺🇸 **English**\nI want to use Kokona.\n\n' +
        '🇯🇵 自動翻訳'
    );
    expect(allowedMentions).toEqual({ parse: [], repliedUser: false });
  });

  it('中国語メッセージを日本語と英語に翻訳して返信する', async () => {
    responder = happyResponder({ ja: '心夏を使いたい。', en: 'I want to use Kokona.' });
    const handler = createPipeline();
    const { message, reply } = createMessage('我想用心夏');

    await handler.handle(message);

    const translationReqs = requests.filter((r) => !isDetectionRequest(r));
    expect(translationReqs.map(targetLangOf).sort()).toEqual(['en', 'ja']);
    const jaReq = translationReqs.find((r) => targetLangOf(r) === 'ja');
    expect(promptOf(jaReq!)).toContain('心夏 → ココナ');

    expect(reply).toHaveBeenCalledTimes(1);
    const [{ content }] = reply.mock.calls[0] as [{ content: string }];
    expect(content).toContain('🇯🇵 **日本語**\n心夏を使いたい。');
    expect(content).toContain('🇺🇸 **English**\nI want to use Kokona.');
    expect(content).toMatch(/🇨🇳 自動翻訳$/);
  });

  it('一部の言語だけ失敗した場合は、成功分と失敗表示を返信する', async () => {
    const ok = happyResponder({ zh: '你好。' });
    responder = (req) =>
      !isDetectionRequest(req) && targetLangOf(req) === 'en'
        ? { status: 400 }
        : ok(req);
    const handler = createPipeline();
    const { message, reply } = createMessage('こんにちは');

    await handler.handle(message);

    expect(reply).toHaveBeenCalledTimes(1);
    const [{ content }] = reply.mock.calls[0] as [{ content: string }];
    expect(content).toContain('🇨🇳 **中文**\n你好。');
    expect(content).toContain('🇺🇸 **English**\n⚠️ 翻訳に失敗しました');
  });

  it('Poeが認証エラーを返した場合は、ユーザー向けのエラーメッセージを送る', async () => {
    responder = () => ({ status: 401 });
    const handler = createPipeline();
    const { message, reply, send } = createMessage('こんにちは');

    await handler.handle(message);

    // 認証エラーはリトライしない: 検出1回 + 翻訳2回
    expect(requests).toHaveLength(3);
    expect(reply).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      '⚠️ 認証エラーが発生しました。管理者にお問い合わせください。'
    );
  });

  it('対象外チャンネルやbotのメッセージではPoeを呼ばない', async () => {
    responder = happyResponder({ zh: '你好。', en: 'Hello.' });
    const handler = createPipeline();
    const other = createMessage('こんにちは', { channelId: 'channel-other' });
    const fromBot = createMessage('こんにちは', { bot: true });

    await handler.handle(other.message);
    await handler.handle(fromBot.message);

    expect(requests).toHaveLength(0);
    expect(other.reply).not.toHaveBeenCalled();
    expect(fromBot.reply).not.toHaveBeenCalled();
  });

  it('!auto off の後は翻訳せず、!auto on で再開する', async () => {
    responder = happyResponder({ zh: '你好。', en: 'Hello.' });
    const handler = createPipeline();

    const off = createMessage('!auto off');
    await handler.handle(off.message);
    expect(off.send).toHaveBeenCalledWith('⏸️ 自動翻訳を無効にしました');

    const ignored = createMessage('こんにちは');
    await handler.handle(ignored.message);
    expect(requests).toHaveLength(0);
    expect(ignored.reply).not.toHaveBeenCalled();

    const on = createMessage('!auto on');
    await handler.handle(on.message);
    expect(on.send).toHaveBeenCalledWith('✅ 自動翻訳を有効にしました');

    const translated = createMessage('こんにちは');
    await handler.handle(translated.message);
    expect(translated.reply).toHaveBeenCalledTimes(1);
  });
});
