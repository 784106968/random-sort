// Node 端校验：从 index.html 中抽取纯逻辑 CORE，逐条验证解析 / 去重 / 随机数 / 排序。
// 运行：node --test tests/core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const start = html.indexOf('/* ==CORE-START== */');
const end = html.indexOf('/* ==CORE-END== */');
assert.ok(start > 0 && end > start, 'index.html 中应有 CORE 标记块');

const source = html.slice(start, end).replace('const CORE =', 'globalThis.CORE =');
new Function('crypto', source)(globalThis.crypto);
const CORE = globalThis.CORE;

const txt = readFileSync(join(here, '..', 'samples', '名单示例.txt'), 'utf8');
const json = readFileSync(join(here, '..', 'samples', '名单示例.json'), 'utf8');

test('detectKind 只认 txt / json', () => {
  assert.equal(CORE.detectKind('a.TXT'), 'txt');
  assert.equal(CORE.detectKind('名单.json'), 'json');
  assert.equal(CORE.detectKind('a.csv'), null);
  assert.equal(CORE.detectKind('a'), null);
});

test('txt：按换行切分，忽略空行与首尾空格，保留重复', () => {
  const r = CORE.parseTxt(txt);
  assert.deepEqual(r.names, ['张三', '李四', '王五', '赵六', '孙七', '周八', '周八', '吴九', '郑十']);
  assert.equal(r.emptyLines, 3); // 文件末尾的换行也会算作一个空行
});

test('txt：兼容 CRLF / CR / BOM / 全角空格', () => {
  const r = CORE.parseTxt('\uFEFF张三\r\n李四\r王五\n\u3000\u3000赵六\u3000\n\n');
  assert.deepEqual(r.names, ['张三', '李四', '王五', '赵六']);
});

test('txt：空文件与纯空白文件解析为 0 人（交由 UI 提示）', () => {
  assert.deepEqual(CORE.parseTxt('').names, []);
  assert.deepEqual(CORE.parseTxt('\n\n   \n\t\n').names, []);
});

test('json：字符串数组', () => {
  assert.deepEqual(CORE.parseJson('["张三","李四"]').names, ['张三', '李四']);
});

test('json：对象数组取 name 字段', () => {
  const r = CORE.parseJson(json);
  assert.deepEqual(r.names, ['张三', '李四', '王五', '张三', '赵六']);
});

test('json：中文键「姓名」与数字类型', () => {
  assert.deepEqual(CORE.parseJson('[{"姓名":"张三"},{"姓名":"李四"}]').names, ['张三', '李四']);
  assert.deepEqual(CORE.parseJson('[{"name":101},{"name":102}]').names, ['101', '102']);
});

test('json：嵌套结构自动找数组', () => {
  const r = CORE.parseJson('{"code":0,"data":{"list":[{"name":"甲"},{"name":"乙"}]}}');
  assert.deepEqual(r.names, ['甲', '乙']);
});

test('json：跳过缺少姓名的无效条目并计数', () => {
  const r = CORE.parseJson('[{"name":"甲"},{"id":2},{"name":""},{"name":"乙"}]');
  assert.deepEqual(r.names, ['甲', '乙']);
  assert.equal(r.skipped, 2);
});

test('json：格式错误与空内容抛 ParseError', () => {
  assert.throws(() => CORE.parseJson(''), CORE.ParseError);
  assert.throws(() => CORE.parseJson('{bad json'), CORE.ParseError);
  assert.throws(() => CORE.parseJson('42'), CORE.ParseError);
});

test('重复姓名识别：大小写/空格归一后按出现次数统计', () => {
  const dups = CORE.findDuplicates(['张三', '李四', ' 张三 ', 'Amy', 'amy', '王五']);
  assert.equal(dups.get('张三').count, 2);
  assert.equal(dups.get('amy').count, 2);
  assert.equal(dups.has('李四'), false);
});

test('去重保留首次出现的位置', () => {
  const r = CORE.dedupeNames(['张三', '李四', '张三', '王五', '李四']);
  assert.deepEqual(r.names, ['张三', '李四', '王五']);
  assert.equal(r.removed, 2);
});

test('随机数：范围合法、互不相同、人数一致', () => {
  const people = Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i, name: 'N' + i }));
  const draws = CORE.buildDraws(people);
  assert.equal(draws.length, 200);
  const values = draws.map((d) => d.value);
  assert.equal(new Set(values).size, 200, '随机数不得重复');
  values.forEach((v) => assert.ok(Number.isInteger(v) && v >= 0 && v < 1000000, '随机数越界: ' + v));
  assert.equal(CORE.formatValue(123456), '0.123456');
});

test('随机数：碰撞时重新抽取，用固定序列可复现', () => {
  // 前三次都返回 7，之后返回 8 —— 验证冲突重抽
  const seq = [7, 7, 7, 8];
  let i = 0;
  const draws = CORE.buildDraws([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => seq[i++]);
  assert.deepEqual(draws.map((d) => d.value), [7, 8]);
});

test('排序：从大到小 / 从小到大，次序连续且不跳号', () => {
  const draws = [
    { id: 'a', name: 'A', value: 10 },
    { id: 'b', name: 'B', value: 99 },
    { id: 'c', name: 'C', value: 5 }
  ];
  assert.deepEqual(CORE.rankDraws(draws, 'desc').map((r) => [r.rank, r.name]), [[1, 'B'], [2, 'A'], [3, 'C']]);
  assert.deepEqual(CORE.rankDraws(draws, 'asc').map((r) => [r.rank, r.name]), [[1, 'C'], [2, 'A'], [3, 'B']]);
});

test('排序：不改动原数组（避免结果与名单互相污染）', () => {
  const draws = [{ id: 'a', name: 'A', value: 1 }, { id: 'b', name: 'B', value: 2 }];
  const copy = JSON.parse(JSON.stringify(draws));
  CORE.rankDraws(draws, 'desc');
  assert.deepEqual(draws, copy);
});

test('导出文本：包含次序、姓名、随机数与人数', () => {
  const ranked = CORE.rankDraws([{ id: 'a', name: '张三', value: 123456 }], 'desc');
  const text = CORE.toResultText(ranked, { direction: 'desc', fileName: 'a.txt', date: new Date(2026, 9, 20, 9, 5) });
  assert.match(text, /第 1 位\t张三\t随机数 0\.123456/);
  assert.match(text, /参与人数：1/);
  assert.match(text, /来源文件：a\.txt/);
  assert.match(text, /2026-10-20 09:05/);
});
