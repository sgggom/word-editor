#!/usr/bin/env python3
"""Read the current vocabulary workbook into the editor's display-only metadata."""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
from io import BytesIO
import json
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / '关卡/四游戏词库_精简版.xlsx'
DEFAULT_OUTPUT = ROOT / 'data/word_table.json'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
HEADERS = ['单词', '范围库', '音标', '情绪类型', '是否缩写', '生僻档位', '英文注释', '中文注释']
POOLS = {'必答词': 'target', '额外词': 'extra'}
FIELDS = [('范围库', 1, 4), ('情绪类型', -2, 2), ('是否缩写', 0, 1), ('生僻档位', 1, 5)]
LABELS = {
    'pool': {'target': '必答词', 'extra': '额外词'},
    'emotion': {'-2': '恶性情绪', '-1': '负面情绪', '0': '中性情绪', '1': '正面情绪', '2': '积极情绪'},
    'rarity': {'1': '极常用核心词', '2': '常用高频词', '3': '中等难度词', '4': '进阶低频词', '5': '极生僻／专业罕见词'},
}


def text_content(element):
    return ''.join(t.text or '' for t in element.findall('.//s:t', NS)) if element is not None else ''


def number(value, minimum, maximum, location):
    if not value.strip():
        return None
    try:
        n = Decimal(value)
        if not n.is_finite() or n != n.to_integral_value() or not minimum <= n <= maximum:
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise ValueError(f'{location} 须为空白或 {minimum}–{maximum} 的整数') from None
    return int(n)


def compile_table(source):
    source = Path(source)
    source_bytes = source.read_bytes()
    entries, counts, seen_sheets = {}, Counter(), set()
    with ZipFile(BytesIO(source_bytes)) as book:
        strings = [text_content(item) for item in ET.fromstring(book.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in book.namelist() else []
        relations = {r.get('Id'): r.get('Target') for r in ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))}
        for sheet in ET.fromstring(book.read('xl/workbook.xml')).findall('s:sheets/s:sheet', NS):
            name = sheet.get('name')
            if name not in POOLS:
                continue
            if name in seen_sheets:
                raise ValueError('重复工作表：' + name)
            seen_sheets.add(name)
            target = relations[sheet.get(RID)]
            part = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            columns = None
            for row in ET.fromstring(book.read(part)).findall('s:sheetData/s:row', NS):
                values, formulas = {}, set()
                for cell in row.findall('s:c', NS):
                    column = re.sub(r'\d', '', cell.get('r'))
                    value, kind = cell.find('s:v', NS), cell.get('t')
                    raw = text_content(cell.find('s:is', NS)) if kind == 'inlineStr' else (value.text or '' if value is not None else '')
                    if kind == 's':
                        raw = strings[int(raw)]
                    values[column] = raw
                    if cell.find('s:f', NS) is not None or kind == 'e':
                        formulas.add(column)
                if not any(str(v).strip() for v in values.values()):
                    continue
                if columns is None:
                    columns = {v.strip(): col for col, v in values.items()}
                    if any(h not in columns for h in HEADERS):
                        raise ValueError(name + ' 缺少必需列：' + '、'.join(h for h in HEADERS if h not in columns))
                    continue
                location = name + '第 ' + row.get('r', '?') + ' 行'
                if formulas.intersection(columns[h] for h in ['单词', *[f[0] for f in FIELDS]]):
                    raise ValueError(location + ' 的词头及标注列需要已确认的静态值')
                word = values.get(columns['单词'], '').strip().upper()
                if not re.fullmatch(r'[A-Z]{3,8}', word):
                    raise ValueError(location + ' 的单词须为 3–8 个英文字母')
                if word in entries:
                    raise ValueError('重复词条：' + word)
                entries[word] = [POOLS[name], *[number(values.get(columns[field], ''), low, high, location + '“' + field + '”') for field, low, high in FIELDS]]
                counts[POOLS[name]] += 1
            if columns is None:
                raise ValueError(name + ' 没有表头')
    if seen_sheets != set(POOLS):
        raise ValueError('需要“必答词”和“额外词”两个工作表')
    if not entries:
        raise ValueError('词库表没有词条')
    source_name = source.resolve().relative_to(ROOT).as_posix() if source.resolve().is_relative_to(ROOT) else source.name
    return {
        'schemaVersion': 1,
        'source': {'file': source_name, 'sha256': hashlib.sha256(source_bytes).hexdigest()},
        'fields': ['pool', 'scope', 'emotion', 'abbreviation', 'rarity'],
        'labels': LABELS,
        'counts': {'target': counts['target'], 'extra': counts['extra'], 'total': len(entries)},
        'entries': dict(sorted(entries.items())),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    compiled = compile_table(args.source)
    if args.check:
        if not args.output.exists() or json.loads(args.output.read_text()) != compiled:
            raise SystemExit('显示用词库数据与当前表格不一致，请先运行导入命令')
    else:
        # Keep one word per line so changes can be reviewed without a huge one-line diff.
        head = json.dumps({k: v for k, v in compiled.items() if k != 'entries'}, ensure_ascii=False, indent=2)
        rows = ',\n'.join('    ' + json.dumps(w) + ': ' + json.dumps(v, ensure_ascii=False) for w, v in compiled['entries'].items())
        payload = head[:-2] + ',\n  "entries": {\n' + rows + '\n  }\n}\n'
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix('.json.tmp')
        temporary.write_text(payload, encoding='utf-8')
        temporary.replace(args.output)
    print(json.dumps({'checked': args.check, **compiled['counts'], 'sourceSha256': compiled['source']['sha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
