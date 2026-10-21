#!/usr/bin/env python3
"""Read the literal level-letter cells from the supplied Excel configuration."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
NS = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def read_config(source):
    with ZipFile(source) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(cell.itertext()) for cell in
                      ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('x:si', NS)]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        sheet = next((s for s in workbook.findall('x:sheets/x:sheet', NS) if s.get('name') == '关卡配置'), None)
        if sheet is None:
            raise ValueError('缺少“关卡配置”工作表')
        rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in rels if r.get('Id') == sheet.get(REL))
        sheet_path = target.lstrip('/') if target.startswith('/') else str(PurePosixPath('xl') / target)
        rows = ET.fromstring(archive.read(sheet_path)).findall('x:sheetData/x:row', NS)
        levels = {}
        for row in rows:
            values = {}
            for cell in row.findall('x:c', NS):
                column = re.sub(r'\d', '', cell.get('r', ''))
                if column not in ['A', 'B', 'C', 'D', 'E']:
                    continue
                if cell.find('x:f', NS) is not None:
                    raise ValueError(f'关卡配置 {cell.get("r")} 必须是实际值，不能依赖公式缓存')
                v = cell.find('x:v', NS)
                value = v.text if v is not None else ''
                if cell.get('t') == 's':
                    value = shared[int(value)]
                elif cell.get('t') == 'inlineStr':
                    value = ''.join(cell.find('x:is', NS).itertext())
                values[column] = (value or '').strip()
            if row.get('r') == '1':
                if values.get('A') != '关卡 ID':
                    raise ValueError('关卡配置首列必须为“关卡 ID”')
                continue
            if not any(values.values()):
                continue
            raw_number = values.get('A', '')
            if not re.fullmatch(r'[1-9]\d*', raw_number):
                raise ValueError(f'无效关卡号：{raw_number}')
            number = int(raw_number)
            if number in levels:
                raise ValueError(f'重复关卡号：{number}')
            letters = [values.get(c, '') for c in ['B', 'C', 'D', 'E'] if values.get(c)]
            if not 3 <= len(letters) <= 4 or any(not re.fullmatch('[A-Z]', c) for c in letters):
                raise ValueError(f'第{number}关必须配置3–4个A–Z字母')
            if len(set(letters)) != len(letters):
                raise ValueError(f'第{number}关存在重复必选字母')
            levels[number] = ''.join(letters)
    if sorted(levels) != list(range(1, 1001)):
        raise ValueError('配置必须完整覆盖第1–1000关')
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    return {'schemaVersion': 1, 'id': 'required-letters-' + source_hash[:16],
            'name': '1–1000关必选字母', 'sourceFile': source.name, 'sourceSheet': '关卡配置',
            'sourceSha256': source_hash, 'firstLevel': 1, 'lastLevel': 1000,
            'levels': {str(n): levels[n] for n in sorted(levels)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/required_letters.json')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = read_config(args.source)
    content = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        assert args.output.read_text() == content, '必选字母配置与Excel实际行内容不一致'
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content)
    print(json.dumps({'levels': len(result['levels']), 'letters': sum(map(len, result['levels'].values())),
                      'threeLetterLevels': sum(len(v) == 3 for v in result['levels'].values()),
                      'fourLetterLevels': sum(len(v) == 4 for v in result['levels'].values()),
                      'output': str(args.output), 'checked': args.check}, ensure_ascii=False))


if __name__ == '__main__':
    main()
