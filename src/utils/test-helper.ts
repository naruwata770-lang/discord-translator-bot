/**
 * テスト用ヘルパー関数
 * @module utils/test-helper
 */

/**
 * 文字列が空かどうかをチェック
 * @param str - チェック対象の文字列
 * @returns 文字列が空または空白文字のみの場合true、それ以外はfalse
 * @example
 * isEmpty('') // true
 * isEmpty('  ') // true
 * isEmpty(null) // true
 * isEmpty(undefined) // true
 * isEmpty('hello') // false
 */
export function isEmpty(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * 配列が空かどうかをチェック
 * @param arr - チェック対象の配列
 * @returns 配列が存在しないまたは要素数が0の場合true、それ以外はfalse
 * @example
 * isArrayEmpty([]) // true
 * isArrayEmpty(null) // true
 * isArrayEmpty(undefined) // true
 * isArrayEmpty([1, 2, 3]) // false
 */
export function isArrayEmpty<T>(arr: T[] | null | undefined): boolean {
  return !arr || arr.length === 0;
}
