#!/usr/bin/env python3
"""Refresh self-contained HTML assets; index.html remains the UI source."""
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
index = root / 'index.html'
text = index.read_text()
# Derive the CLI default with exactly the same compiler used in the browser.
compiled = subprocess.check_output(['node', '-e', "const L=require('./src/library');const d=require('./data/game_vocab/catalog.json');process.stdout.write(JSON.stringify(L.compile(d,L.tieredRecipes(d)[0]).lex,null,2)+'\\n');"], cwd=root, text=True)
(root / 'src/lex.json').write_text(compiled)
start = text.index('/* 旧关卡与手工编辑的路径校验辅助函数')
end = text.index('</script>', start)
source = '\n'.join((root / name).read_text() for name in ['src/validation.js', 'src/gen.js', 'src/batch_generator.js', 'src/v2_adapter.js', 'src/library.js', 'src/library_overlap.js', 'src/proportional_venn.js'])
source += '\nwindow.WT_PROFILES = ' + (root / 'src/profiles.json').read_text().strip() + ';\n'
text = text[:start] + source + text[end:]
worker_source = (root / 'src/gen.js').read_text() + '\n' + (root / 'src/batch_worker.js').read_text()
worker_payload = json.dumps(worker_source, ensure_ascii=False).replace('</', '<\\/')
text = re.sub(r'(<script id="batchWorker"[^>]*>).*?(</script>)', lambda m: m[1] + worker_payload + m[2], text, flags=re.S)
for key, filename in [('lex', 'src/lex.json'), ('gameVocab', 'data/game_vocab/catalog.json'), ('policy', 'src/policy.json'), ('versions', 'src/version_history.json'), ('defaultGlossary', 'data/glossary/default.json')]:
    payload = json.dumps(json.loads((root / filename).read_text()), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    text = re.sub(r'(<script id="' + key + r'"[^>]*>).*?(</script>)', lambda m: m[1] + payload + m[2], text, flags=re.S)
for name, start_marker, end_marker in [
    ('src/library_runtime.js', '  /* ---------- 词库运行上下文（', '  /* ---------- 词库运行上下文结束 ---------- */'),
    ('src/library_ui.js', '  /* ---------- 词库配置与浏览（', '  /* ---------- 词库配置与浏览结束 ---------- */'),
    ('src/library_range_ui.js', '  /* ---------- 词库范围视图（', '  /* ---------- 词库范围视图结束 ---------- */')
]:
    start = text.index(start_marker)
    end = text.index(end_marker, start) + len(end_marker)
    text = text[:start] + (root / name).read_text().rstrip() + text[end:]
version = json.loads((root / 'src/version_history.json').read_text())[0]['version']
text = re.sub(r'(id="srcBar" title=")([^"]*)', lambda m: m[1] + '版本 ' + version + ' · WTEngine v2', text)
text = re.sub(r'(<button[^>]*id="btnVersion")([^>]*>).*?(</button>)',
              lambda m: m[1] + ' aria-label="版本 v' + version + '，点击查看版本历史" aria-haspopup="dialog">v' + version + m[3], text)
start = text.index('  /* ---------- 批量生成（WTEngine v2）')
end = text.index('  function goLevel', start)
(root / 'src/batch_ui.js').write_text(text[start:end])
index.write_text(text)
(root / 'wordpages-level-desk.html').write_text(text)
