#!/usr/bin/env python3
"""Refresh self-contained HTML assets; index.html remains the UI source."""
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
index = root / 'index.html'
text = index.read_text()
start = text.index('/* 旧关卡与手工编辑的路径校验辅助函数')
end = text.index('</script>', start)
source = '\n'.join((root / name).read_text() for name in ['src/validation.js', 'src/gen.js', 'src/v2_adapter.js'])
source += '\nwindow.WT_PROFILES = ' + (root / 'src/profiles.json').read_text().strip() + ';\n'
text = text[:start] + source + text[end:]
for key, filename in [('lex', 'src/lex.json'), ('policy', 'src/policy.json'), ('versions', 'src/version_history.json')]:
    payload = json.dumps(json.loads((root / filename).read_text()), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    text = re.sub(r'(<script id="' + key + r'"[^>]*>).*?(</script>)', lambda m: m[1] + payload + m[2], text, flags=re.S)
version = json.loads((root / 'src/version_history.json').read_text())[0]['version']
text = re.sub(r'(id="srcBar" title=")([^"]*)', lambda m: m[1] + '版本 ' + version + ' · WTEngine v2', text)
text = re.sub(r'(<button[^>]*id="btnVersion")([^>]*>).*?(</button>)',
              lambda m: m[1] + ' aria-label="版本 v' + version + '，点击查看版本历史" aria-haspopup="dialog">v' + version + m[3], text)
start = text.index('  /* ---------- 批量生成（WTEngine v2）')
end = text.index('  function goLevel', start)
(root / 'src/batch_ui.js').write_text(text[start:end])
index.write_text(text)
(root / 'wordpages-level-desk.html').write_text(text)
