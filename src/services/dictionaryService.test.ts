import { DictionaryService } from './dictionaryService';
import * as fs from 'fs';
import * as path from 'path';

describe('DictionaryService', () => {
  let service: DictionaryService;
  const testDictionaryPath = path.join(
    __dirname,
    '../../dictionaries/strinova.yaml'
  );

  beforeEach(() => {
    service = new DictionaryService();
  });

  describe('loadDictionary', () => {
    it('正常なYAMLファイルを読み込める', () => {
      const dictionary = service.loadDictionary(testDictionaryPath);

      expect(dictionary).toBeDefined();
      expect(dictionary.name).toBe('Strinovaゲーム用語辞書');
      expect(dictionary.version).toBe('1.0.0');
      expect(dictionary.entries).toBeInstanceOf(Array);
      expect(dictionary.entries.length).toBeGreaterThan(0);
    });

    it('エントリの構造が正しい', () => {
      const dictionary = service.loadDictionary(testDictionaryPath);
      const firstEntry = dictionary.entries[0];

      expect(firstEntry.id).toBeDefined();
      expect(firstEntry.aliases).toBeDefined();
      expect(firstEntry.targets).toBeDefined();
    });

    it('存在しないファイルパスでエラー', () => {
      expect(() => {
        service.loadDictionary('/nonexistent/path.yaml');
      }).toThrow();
    });

    it('不正なYAML構文でエラー', () => {
      // 一時的に不正なYAMLファイルを作成
      const invalidYamlPath = path.join(__dirname, 'invalid.yaml');
      fs.writeFileSync(invalidYamlPath, 'invalid: yaml: syntax:');

      expect(() => {
        service.loadDictionary(invalidYamlPath);
      }).toThrow();

      // クリーンアップ
      fs.unlinkSync(invalidYamlPath);
    });

    it('必須フィールド欠落でエラー', () => {
      const invalidYamlPath = path.join(__dirname, 'no-name.yaml');
      fs.writeFileSync(
        invalidYamlPath,
        'version: 1.0.0\nentries: []'
      );

      expect(() => {
        service.loadDictionary(invalidYamlPath);
      }).toThrow(/name.*required/i);

      fs.unlinkSync(invalidYamlPath);
    });

    it('重複IDでエラー', () => {
      const duplicateYamlPath = path.join(__dirname, 'duplicate.yaml');
      fs.writeFileSync(
        duplicateYamlPath,
        `name: Test
version: 1.0.0
entries:
  - id: same_id
    aliases:
      zh: [test1]
    targets:
      ja: テスト1
  - id: same_id
    aliases:
      zh: [test2]
    targets:
      ja: テスト2`
      );

      expect(() => {
        service.loadDictionary(duplicateYamlPath);
      }).toThrow(/duplicate.*id/i);

      fs.unlinkSync(duplicateYamlPath);
    });

    it('空YAMLファイルでエラー', () => {
      const emptyYamlPath = path.join(__dirname, 'empty.yaml');
      fs.writeFileSync(emptyYamlPath, '');

      expect(() => {
        service.loadDictionary(emptyYamlPath);
      }).toThrow(/validation failed/i);

      fs.unlinkSync(emptyYamlPath);
    });

    it('エイリアスに空文字列が含まれる場合エラー', () => {
      const emptyAliasPath = path.join(__dirname, 'empty-alias.yaml');
      fs.writeFileSync(
        emptyAliasPath,
        `name: Test
version: 1.0.0
entries:
  - id: test_entry
    aliases:
      zh: ['', test]
    targets:
      ja: テスト`
      );

      expect(() => {
        service.loadDictionary(emptyAliasPath);
      }).toThrow(/empty.*alias/i);

      fs.unlinkSync(emptyAliasPath);
    });

    it('エイリアスが配列でなく文字列の場合エラー', () => {
      const stringAliasPath = path.join(__dirname, 'string-alias.yaml');
      fs.writeFileSync(
        stringAliasPath,
        `name: Test
version: 1.0.0
entries:
  - id: test_entry
    aliases:
      zh: test_string
    targets:
      ja: テスト`
      );

      expect(() => {
        service.loadDictionary(stringAliasPath);
      }).toThrow(/alias.*array/i);

      fs.unlinkSync(stringAliasPath);
    });

    it('ターゲットが空文字列の場合エラー', () => {
      const emptyTargetPath = path.join(__dirname, 'empty-target.yaml');
      fs.writeFileSync(
        emptyTargetPath,
        `name: Test
version: 1.0.0
entries:
  - id: test_entry
    aliases:
      zh: [test]
    targets:
      ja: ''`
      );

      expect(() => {
        service.loadDictionary(emptyTargetPath);
      }).toThrow(/empty.*target/i);

      fs.unlinkSync(emptyTargetPath);
    });
  });

  describe('findMatches', () => {
    beforeEach(() => {
      service.loadDictionary(testDictionaryPath);
    });

    it('完全一致で辞書エントリを検出（中国語→日本語）', () => {
      const matches = service.findMatches('卡拉彼丘很强', 'zh', 'ja');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchedTerm).toBe('卡拉彼丘');
      expect(matches[0].targetTerm).toBe('ストリノヴァ');
      expect(matches[0].matchedLanguage).toBe('zh');
      expect(matches[0].targetLanguage).toBe('ja');
    });

    it('エイリアス（略称）でマッチ', () => {
      const matches = service.findMatches('卡拉很强', 'zh', 'ja');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchedTerm).toBe('卡拉');
      expect(matches[0].targetTerm).toBe('ストリノヴァ');
    });

    it('部分一致で辞書エントリを検出', () => {
      const matches = service.findMatches('我喜欢玩卡拉', 'zh', 'ja');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchedTerm).toBe('卡拉');
    });

    it('複数エントリのマッチ', () => {
      const matches = service.findMatches('緋莎和心夏很强', 'zh', 'ja');

      expect(matches.length).toBe(2);
      const matchedTerms = matches.map((m) => m.matchedTerm);
      expect(matchedTerms).toContain('緋莎');
      expect(matchedTerms).toContain('心夏');
    });

    it('マッチしない場合は空配列', () => {
      const matches = service.findMatches('这是一个普通的句子', 'zh', 'ja');

      expect(matches).toEqual([]);
    });

    it('日本語→中国語の方向でもマッチする', () => {
      const matches = service.findMatches('ストリノヴァは楽しい', 'ja', 'zh');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchedTerm).toBe('ストリノヴァ');
      expect(matches[0].targetTerm).toBe('卡拉彼丘');
      expect(matches[0].matchedLanguage).toBe('ja');
      expect(matches[0].targetLanguage).toBe('zh');
    });

    it('ターゲット言語が存在しない場合はスキップ', () => {
      // 英語がターゲットだが、一部エントリには英語が未定義
      const matches = service.findMatches('卡拉很强', 'zh', 'en');

      // マッチするが、enターゲットがあるエントリのみ
      matches.forEach((match) => {
        expect(match.targetTerm).toBeDefined();
        expect(match.targetTerm).not.toBe('');
      });
    });
  });

  describe('generatePromptHint', () => {
    beforeEach(() => {
      service.loadDictionary(testDictionaryPath);
    });

    it('マッチ1件の場合のプロンプト生成', () => {
      const matches = service.findMatches('卡拉很强', 'zh', 'ja');
      const hint = service.generatePromptHint(matches);

      expect(hint).toContain('卡拉');
      expect(hint).toContain('ストリノヴァ');
    });

    it('マッチ複数件の場合のプロンプト生成', () => {
      const matches = service.findMatches('緋莎和心夏很强', 'zh', 'ja');
      const hint = service.generatePromptHint(matches);

      expect(hint).toContain('緋莎');
      expect(hint).toContain('フューシャ');
      expect(hint).toContain('心夏');
      expect(hint).toContain('ココナ');
    });

    it('マッチ0件の場合は空文字列', () => {
      const matches = service.findMatches('这是一个普通的句子', 'zh', 'ja');
      const hint = service.generatePromptHint(matches);

      expect(hint).toBe('');
    });

    it('生成されたヒントが適切なフォーマット', () => {
      const matches = service.findMatches('卡拉很强', 'zh', 'ja');
      const hint = service.generatePromptHint(matches);

      // Few-shot形式の確認
      expect(hint).toMatch(/translation/i);
    });
  });
});
