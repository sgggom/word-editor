#!/usr/bin/env python3
"""Verify applied dictionary follow-ups and write their before/after audit."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def lines(path):
    return [json.loads(s) for s in path.read_text().splitlines() if s.strip()]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit-dir', type=Path, required=True)
    args = parser.parse_args()
    folder = args.audit_dir.resolve()
    manifest = json.loads((folder / 'manifest.json').read_text())
    baseline = json.loads((folder / 'baseline.json').read_text())['entries']
    runtime_path = ROOT / 'data/glossary/default.json'
    runtime = json.loads(runtime_path.read_text())['entries']
    assert digest(folder / 'baseline.json') == manifest['sourceSha256']
    assert set(baseline) == set(runtime)
    inputs, verdicts = {}, {}
    for shard in manifest['shards']:
        name = shard['id']
        source = lines(folder / name / 'input.jsonl')
        reviews = lines(folder / name / 'ledger.jsonl')
        source_map = {r['word']: r for r in source}
        review_map = {r['word']: r for r in reviews}
        assert len(source) == len(source_map) == len(reviews) == len(review_map) == shard['words']
        assert source_map.keys() == review_map.keys()
        assert not inputs.keys() & source_map.keys()
        inputs.update(source_map)
        verdicts.update(review_map)
    assert len(inputs) == manifest['pendingWords'] == 522
    for name in ('confirmed-ledger.jsonl', 'parent-overrides.jsonl'):
        for r in lines(folder / name):
            verdicts[r['word']] = r
    scope = set(inputs) | set(manifest['confirmedWords'])
    assert set(verdicts) == scope
    correction_dir = ROOT / 'data/glossary/reviewed/dictionary-followup-2026-10-21'
    corrections, files = {}, {}
    for path in sorted(correction_dir.glob('*.json')):
        corrections.update(json.loads(path.read_text()))
        files[str(path.relative_to(ROOT))] = digest(path)
    assert set(corrections) == {w for w, r in verdicts.items() if r['status'] == 'corrected'}
    assert all(runtime[w] == baseline[w] for w in set(runtime) - scope), 'Unrelated entry changed'
    records, changed_fields = [], Counter()
    for word in sorted(scope):
        review = verdicts[word]
        assert review['status'] in ('corrected', 'verified', 'pending')
        assert review.get('reason') and review.get('sources')
        assert all(s.get('url', '').startswith(('https://', 'http://')) and s.get('evidence') for s in review['sources']), word
        before, after = baseline[word], runtime[word]
        fields = [f for i, f in enumerate(('ipa', 'zh', 'en')) if before[i] != after[i]]
        if review['status'] == 'corrected':
            assert fields, word + ': corrected but no lexical change'
            correction = corrections[word]
            assert after[1] == correction['zh'].strip() and after[2] == correction['en'].strip(), word + ': correction not applied'
            assert re.search(r'[\u3400-\u9fff]', after[1]), word + ': missing Chinese'
            assert re.search(r'[A-Za-z]', after[2]), word + ': missing English'
            assert len(re.findall(r'[\u3400-\u9fff]', after[2])) / max(1, len(after[2])) < .15, word + ': probable swapped language fields'
        elif review['status'] == 'verified':
            assert not fields, word + ': verified entry unexpectedly changed'
        if review['status'] != 'pending':
            assert review.get('sourceComplete') is True, word + ': incomplete source'
        restored = bool(inputs.get(word, {}).get('sourceIntegritySignals'))
        if restored:
            assert review['status'] == 'corrected' and 'en' in fields and review['sourceComplete'], word + ': truncated English not repaired'
        changed_fields.update(fields)
        records.append({**review, 'before': {'ipa': before[0], 'zh': before[1], 'en': before[2]},
                        'after': {'ipa': after[0], 'zh': after[1], 'en': after[2]},
                        'changedFields': fields, 'restoredTruncatedEnglish': restored})
    carried = json.loads((ROOT / 'data/glossary/audits/2026-10-21/pending.json').read_text())
    pending = {r['word']: r for r in carried}
    pending.update({r['word']: r for r in records if r['status'] == 'pending'})
    permanent = ROOT / 'data/glossary/audits/2026-10-21-dictionary-followup'
    permanent.mkdir(exist_ok=True)
    version = json.loads((ROOT / 'src/version_history.json').read_text())[0]['version']
    summary = {'schemaVersion': 1, 'version': version, 'scopeWords': len(records),
               'googlePendingReviewed': len(inputs), 'alreadyConfirmedReviewed': len(manifest['confirmedWords']),
               'statuses': dict(Counter(r['status'] for r in records)),
               'changedWords': sum(bool(r['changedFields']) for r in records), 'changedFields': dict(changed_fields),
               'restoredTruncatedEnglish': sum(r['restoredTruncatedEnglish'] for r in records),
               'baselineSha256': manifest['sourceSha256'], 'runtimeSha256': digest(runtime_path),
               'runtimeWords': len(runtime), 'unrelatedEntriesUnchanged': True,
               'carriedPendingWords': len(carried), 'runtimePendingWords': len(pending),
               'reviewerModel': manifest['reviewerModel'], 'correctionFiles': files,
               'scopeNote': 'Dictionary verification of 522 flagged entries and 2 previously confirmed inconsistencies. Existing pronunciation/rare-word pending items are retained separately.'}
    for destination in (folder, permanent):
        (destination / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
        (destination / 'ledger.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records))
    (permanent / 'pending.json').write_text(json.dumps(list(pending.values()), ensure_ascii=False, indent=2) + '\n')
    # The builder must have applied the same unresolved marker set.
    assert {w for w, r in runtime.items() if r[3].get('reviewStatus') == 'pending'} == set(pending)
    payload = json.dumps({'summary': summary, 'rows': records}, ensure_ascii=False, separators=(',', ':'))
    payload = payload.replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
    (folder / 'report.html').write_text(TEMPLATE.replace('__DATA__', payload))
    print(json.dumps(summary, ensure_ascii=False))


TEMPLATE = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>词典复核与配表修正</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f4ef;color:#27352d;font:15px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1560px;margin:auto;padding:30px}h1{font-size:28px;margin:0 0 8px}.sub,.foot{color:#647164}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.stat{background:white;border:1px solid #d8dfd6;border-radius:10px;padding:15px 20px;min-width:175px}.stat b{display:block;font-size:27px;color:#246a4d}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}input,select,button{font:inherit;padding:8px 12px;background:white;border:1px solid #bac9bb;border-radius:7px}input{flex:1;min-width:230px}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}.pager{display:flex;justify-content:space-between;margin:16px 0}.scroll{overflow:auto;border:1px solid #d8dfd6;border-radius:8px;background:white}table{border-collapse:collapse;width:100%;min-width:1050px;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #e1e6de;overflow-wrap:anywhere}th{background:#e5ece1}th:first-child{width:9%}th:nth-child(2),th:nth-child(3){width:31%}th:nth-child(4){width:29%}.en{font-size:13px;color:#5b625c;margin-top:8px}.tag{display:inline-block;background:#e4eee0;border-radius:5px;padding:1px 7px;font-size:12px}.pending{background:#fff0bf}.reason{font-size:13px;margin:8px 0}a{color:#236849}.sources{font-size:12px}.foot{font-size:12px}
</style><main><h1>词典复核与配表修正</h1><p class="sub" id="subtitle"></p><div class="stats" id="stats"></div>
<div class="controls"><input id="query" placeholder="搜索词条、修正前后释义或核对原因"><select id="status"><option value="all">全部状态</option><option value="corrected">已修正</option><option value="verified">词典核对后保留</option><option value="pending">本轮待查</option></select><button id="export">导出当前筛选 JSON</button></div>
<div class="pager"><span id="count"></span><div><button id="prev">上一页</button> <button id="next">下一页</button></div></div>
<div class="scroll"><table><thead><tr><th>词条</th><th>修正前</th><th>当前配表</th><th>核对结论与来源</th></tr></thead><tbody id="body"></tbody></table></div><p class="foot" id="foot"></p>
</main><script id="data" type="application/json">__DATA__</script><script>
const data=JSON.parse(document.getElementById('data').textContent),s=data.summary,rows=data.rows;
document.getElementById('subtitle').textContent='v'+s.version+' · 522 条 Google 复查疑点 + 2 条已确认问题 · 修订已写入共享配表';
const cards=[['本轮词条',s.scopeWords],['实际修正',s.changedWords],['核实后保留',s.statuses.verified||0],['英文截断已补全',s.restoredTruncatedEnglish],['本轮待查',s.statuses.pending||0]];
for(const [label,value] of cards){const d=document.createElement('div');d.className='stat';const b=document.createElement('b');b.textContent=value;d.append(b,document.createTextNode(label));document.getElementById('stats').append(d)}
document.getElementById('foot').textContent='共有 '+s.runtimeWords+' 个运行词条；范围外词条未变。另保留先前 '+s.carriedPendingWords+' 条读音或罕词待核记录。运行配表 SHA-256：'+s.runtimeSha256+'。';
const labels={corrected:'已修正',verified:'词典核对后保留',pending:'待查'};let filtered=rows,page=0;const size=50;
function cell(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);return td}
function meaning(tr,row){const td=cell(tr,row.zh);const en=document.createElement('div');en.className='en';en.textContent=row.en;td.append(en)}
function render(){const body=document.getElementById('body');body.replaceChildren();for(const r of filtered.slice(page*size,(page+1)*size)){const tr=document.createElement('tr');cell(tr,r.word.toUpperCase());meaning(tr,r.before);meaning(tr,r.after);const td=cell(tr,'');const tag=document.createElement('span');tag.className='tag '+r.status;tag.textContent=labels[r.status];td.append(tag);const reason=document.createElement('div');reason.className='reason';reason.textContent=r.reason;td.append(reason);const sources=document.createElement('div');sources.className='sources';for(const src of r.sources){if(!/^https?:\\/\\//.test(src.url))continue;const a=document.createElement('a');a.href=src.url;a.textContent=src.title||src.url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a,document.createElement('br'))}td.append(sources);body.append(tr)}document.getElementById('count').textContent=filtered.length+' 条结果 · 第 '+(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/size))+' 页';document.getElementById('prev').disabled=page===0;document.getElementById('next').disabled=(page+1)*size>=filtered.length}
function filter(){const q=document.getElementById('query').value.trim().toLowerCase(),state=document.getElementById('status').value;filtered=rows.filter(r=>(state==='all'||state===r.status)&&(!q||[r.word,r.before.zh,r.before.en,r.after.zh,r.after.en,r.reason].join(' ').toLowerCase().includes(q)));page=0;render()}
document.getElementById('query').oninput=filter;document.getElementById('status').onchange=filter;document.getElementById('prev').onclick=()=>{page--;render()};document.getElementById('next').onclick=()=>{page++;render()};document.getElementById('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(filtered,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='dictionary-followup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};render();
</script></html>'''


if __name__ == '__main__':
    main()
