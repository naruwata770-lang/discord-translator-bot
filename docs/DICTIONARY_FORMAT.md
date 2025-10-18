# 翻訳辞書フォーマット仕様

## 概要

翻訳botで使用する辞書ファイルのフォーマット仕様書です。

## ファイル形式

- **フォーマット**: YAML
- **文字コード**: UTF-8
- **配置場所**: `dictionaries/` ディレクトリ

## 基本構造

```yaml
name: 辞書名
version: バージョン番号（例: 1.0.0）
description: 辞書の説明（省略可）

entries:
  - id: エントリの一意識別子
    aliases:
      ja: [日本語の別名リスト]
      zh: [中国語の別名リスト]
      en: [英語の別名リスト]
    targets:
      ja: 日本語の翻訳
      zh: 中国語の翻訳
      en: 英語の翻訳
    category: カテゴリ（省略可）
    note: メモ（省略可）
```

## フィールド説明

### トップレベル

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `name` | string | ✓ | 辞書の名前 |
| `version` | string | ✓ | セマンティックバージョニング（例: 1.0.0） |
| `description` | string | - | 辞書の説明文 |
| `entries` | array | ✓ | 辞書エントリのリスト |

### エントリ（entries配列の各要素）

| フィールド | 型 | 必須 | 説明 |
|----------|-----|------|------|
| `id` | string | ✓ | エントリの一意識別子（英数字とアンダースコア推奨） |
| `aliases` | object | ✓ | 言語別のエイリアスリスト |
| `targets` | object | ✓ | 言語別の翻訳ターゲット |
| `category` | string | - | カテゴリ（`game_name`, `character`, `game_term`, `location`, `item`, `other`） |
| `note` | string | - | メモや補足情報 |

### aliases

各言語コード（`ja`, `zh`, `en`）ごとに、その言語での別名を配列で指定します。

```yaml
aliases:
  zh: [卡拉彼丘, 卡拉]  # 中国語での正式名称と略称
  ja: [信長]           # 日本語での別名
```

### targets

各言語コード（`ja`, `zh`, `en`）ごとに、その言語での翻訳を指定します。

```yaml
targets:
  ja: ストリノヴァ
  zh: 卡拉彼丘
  en: Strinova
```

## 使用例

### 例1: ゲーム名（略称あり）

```yaml
- id: strinova_game
  aliases:
    zh: [卡拉彼丘, 卡拉]  # 正式名称と略称
  targets:
    ja: ストリノヴァ
    zh: 卡拉彼丘
    en: Strinova
  category: game_name
  note: ゲーム名の正式名称と略称
```

**動作**:
- 中国語「卡拉很强」→ 日本語「ストリノヴァは強い」
- 日本語「ストリノヴァ楽しい」→ 中国語「卡拉彼丘很好玩」

### 例2: キャラクター名（多言語対応）

```yaml
- id: nobunaga
  aliases:
    zh: [信]
    ja: [信長]
  targets:
    ja: 信長
    zh: 信
    en: Nobunaga
  category: character
```

**動作**:
- 中国語「信很强」→ 日本語「信長は強い」
- 日本語「信長のエイムがやばい」→ 中国語「信的瞄准很厉害」

### 例3: ゲーム用語

```yaml
- id: scissors
  aliases:
    zh: [剪刀手]
  targets:
    ja: シザーズ
    zh: 剪刀手
  category: game_term
```

## ベストプラクティス

### 1. IDの命名規則

- 英数字とアンダースコアのみ使用
- わかりやすい名前をつける
- 例: `strinova_game`, `character_fuesha`, `term_scissors`

### 2. aliasesの使い方

- **正式名称と略称を両方登録**: `卡拉彼丘`と`卡拉`
- **よく使われる表記のバリエーション**: 全角/半角、大文字/小文字など
- **翻訳しない用語も登録**: ゲーム名など（全言語で同じターゲットを設定）

### 3. targetsの設定

- 最低でも`ja`と`zh`は設定する
- `en`は将来的に必要になる可能性があるため、分かる範囲で設定しておく
- 翻訳しない用語（固有名詞など）は全言語で同じ値を設定

### 4. categoryの活用

- カテゴリを設定することで、将来的に用途別フィルタリングが可能
- 推奨カテゴリ:
  - `game_name`: ゲームタイトル
  - `character`: キャラクター名
  - `game_term`: ゲーム内用語
  - `location`: 場所・マップ名
  - `item`: アイテム名

### 5. noteの活用

- エントリの由来や使い方をメモ
- 翻訳者への注意事項
- 例: 「この用語は翻訳しない」「スラング表現」など

## バリデーション

辞書ファイルは以下のバリデーションが行われます：

1. **YAML構文チェック**: 正しいYAML形式か
2. **必須フィールドチェック**: `name`, `version`, `entries`が存在するか
3. **エントリチェック**: 各エントリに`id`, `aliases`, `targets`が存在するか
4. **重複チェック**: 同じIDのエントリが複数ないか
5. **言語コードチェック**: `ja`, `zh`, `en`以外の言語コードが使われていないか

## TypeScript型定義

TypeScriptでの型定義は以下のようになります：

```typescript
interface Dictionary {
  name: string;
  version: string;
  description?: string;
  entries: DictionaryEntry[];
}

interface DictionaryEntry {
  id: string;
  aliases: Partial<Record<'ja' | 'zh' | 'en', string[]>>;
  targets: Partial<Record<'ja' | 'zh' | 'en', string>>;
  category?: 'game_name' | 'character' | 'game_term' | 'location' | 'item' | 'other';
  note?: string;
}
```

## 更新履歴

- **1.0.0** (2025-01-XX): 初版作成
