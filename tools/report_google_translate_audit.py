#!/usr/bin/env python3
"""Create a standalone, filterable report from Google evidence and agent verdicts."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import google_translate_audit as google

ROOT = Path(__file__).resolve().parents[1]
STATUSES = {'confirmed_mismatch', 'google_mistranslation', 'compatible', 'needs_dictionary_check', 'different_sense_coverage'}


def lines(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit-dir', type=Path, required=True)
    parser.add_argument('--allow-incomplete', action='store_true')
    args = parser.parse_args()
    folder = args.audit_dir.resolve()
    manifest = json.loads((folder / 'manifest.json').read_text())
    records, groups, request_counts = [], [], {}
    raw_cache = {}
    for shard in manifest['shards']:
        name = shard['id']
        source = lines(folder / (name + '-input.jsonl'))
        translated = {r['word']: r for r in lines(folder / name / 'translations.jsonl')}
        compared = {r['word']: r for r in lines(folder / name / 'comparisons.jsonl')}
        reviewed_list = lines(folder / name / 'review.jsonl')
        reviewed = {r['word']: r for r in reviewed_list}
        assert len(reviewed) == len(reviewed_list), name + ': duplicate model verdict'
        candidates = {r['word'] for r in compared.values() if r['priority'] >= 2 and r['translationStatus'] == 'success'}
        integrity = {r['word']: r for r in lines(folder / name / 'source-integrity-candidates.jsonl')}
        assert set(integrity) <= {r['word'] for r in source}, name + ': unknown source-integrity candidate'
        assert set(reviewed) <= {r['word'] for r in source}, name + ': unknown reviewed word'
        if not args.allow_incomplete:
            assert len(source) == len(translated) == len(compared) == shard['words'], name + ': missing rows'
            assert candidates <= set(reviewed), name + ': some flagged candidates lack individual review'
            assert set(integrity) == {r['word'] for r in source if google.source_integrity_signals(r['en'])}, name + ': incomplete source-integrity candidate list'
            assert set(integrity) <= set(reviewed), name + ': some source-integrity candidates lack individual review'
        for row in source:
            word = row['word']
            result = translated.get(word, {'translationStatus': 'not_attempted', 'googleZh': None, 'requestIds': []})
            if word in translated:
                assert result['en'] == row['en'] and result['zh'] == row['zh'], word + ': source changed'
                assert result['sourceSha256'] == hashlib.sha256(row['en'].encode()).hexdigest(), word + ': source hash mismatch'
            if not args.allow_incomplete:
                assert result['translationStatus'] == 'success', word + ': Google translation not completed'
                for rid in result['requestIds']:
                    raw_path = folder / name / 'raw' / (rid + '.json')
                    if (name, rid) not in raw_cache:
                        raw = json.loads(raw_path.read_text())
                        assert raw['httpStatus'] == 200 and raw['requestId'] == rid
                        assert google.digest('en\0zh-CN\0' + raw['sourceText']) == rid
                        text = google.translated_text(raw['response'])
                        markers = [m[1] for m in google.MARKER.finditer(raw['sourceText'])]
                        parsed = google.parse_marked(text, markers) if markers else None
                        source_parts = google.parse_marked(raw['sourceText'], markers) if markers else None
                        raw_cache[name, rid] = (raw['sourceText'], parsed, text.strip(), source_parts)
                rebuilt = []
                for unit in google.units_for([row]):
                    matches = []
                    for rid in result['requestIds']:
                        sent, parsed, plain, source_parts = raw_cache[name, rid]
                        if parsed is not None and unit['id'] in parsed:
                            assert source_parts[unit['id']] == unit['text'].strip(), word + ': source content assigned to wrong marker'
                            matches.append(parsed[unit['id']])
                        elif parsed is None and sent == unit['text']:
                            matches.append(plain)
                    assert len(matches) == 1, word + ': Google evidence is missing or ambiguous'
                    rebuilt.append(matches[0])
                assert '\n'.join(rebuilt) == result['googleZh'], word + ': translation differs from raw Google response'
            review = reviewed.get(word)
            if review:
                assert review['status'] in STATUSES and review.get('reason'), word + ': incomplete verdict'
            comparison = compared.get(word, {})
            records.append({'word': word, 'en': row['en'], 'zh': row['zh'], 'googleZh': result['googleZh'], 'translationStatus': result['translationStatus'], 'previousReviewStatus': row.get('metadata', {}).get('reviewStatus'), 'signal': comparison.get('signal', 'not_compared'), 'priority': comparison.get('priority', 0), 'reasons': comparison.get('reasons', []), 'sourceIntegritySignals': integrity.get(word, {}).get('sourceIntegritySignals', []), 'reviewStatus': review['status'] if review else 'script_only', 'reviewReason': review['reason'] if review else '', 'suggestedZh': review.get('suggestedZh', '') if review else '', 'suggestedEn': review.get('suggestedEn', '') if review else '', 'shard': name, 'requestIds': result['requestIds']})
            records[-1]['reviewSources'] = review.get('sources', []) if review else []
        groups.append({'shard': name, 'words': len(source), 'translations': dict(Counter(r['translationStatus'] for r in translated.values())), 'flaggedCandidates': len(candidates), 'reviewedCandidates': len(candidates & set(reviewed)), 'sourceIntegrityCandidates': len(integrity), 'reviewedSourceIntegrityCandidates': len(set(integrity) & set(reviewed)), 'verdicts': dict(Counter(r['status'] for r in reviewed.values()))})
        request_counts[name] = len(list((folder / name / 'raw').glob('*.json')))
    assert len(records) == len({r['word'] for r in records}) == manifest['words']
    summary = {'scope': manifest['scope'], 'sourceSha256': manifest['sourceSha256'], 'words': len(records), 'provider': 'Google Translate public endpoint (client=gtx)', 'reviewerModel': 'gpt-6-luna', 'translationDirection': 'English definition to Simplified Chinese', 'complete': not args.allow_incomplete, 'translations': dict(Counter(r['translationStatus'] for r in records)), 'signals': dict(Counter(r['signal'] for r in records)), 'reviewStatuses': dict(Counter(r['reviewStatus'] for r in records)), 'flaggedCandidates': sum(g['flaggedCandidates'] for g in groups), 'reviewedCandidates': sum(g['reviewedCandidates'] for g in groups), 'savedSuccessfulResponses': request_counts, 'groups': groups, 'limitations': ['Google translates the existing English definition; this does not independently certify that the English definition belongs to the headword.', 'Character overlap is used only to prioritize discrepancies. Rows marked script_only have not received a second per-entry semantic verdict.', 'Google and model reviewers can both make mistakes. Confirmed mismatch means the reviewing model identified a bilingual inconsistency; dictionary verification may still be needed.']}
    summary.update(sourceIntegrityCandidates=sum(g['sourceIntegrityCandidates'] for g in groups), reviewedSourceIntegrityCandidates=sum(g['reviewedSourceIntegrityCandidates'] for g in groups), sourceIntegrityVerdicts=dict(Counter(r['reviewStatus'] for r in records if r['sourceIntegritySignals'])), modelReviewedWords=sum(r['reviewStatus'] != 'script_only' for r in records))
    (folder / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    (folder / 'all-comparisons.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records))
    issues = [r for r in records if r['reviewStatus'] in ['confirmed_mismatch', 'needs_dictionary_check', 'different_sense_coverage']]
    (folder / 'findings.json').write_text(json.dumps(issues, ensure_ascii=False, indent=2) + '\n')
    payload = json.dumps({'summary': summary, 'rows': records}, ensure_ascii=False, separators=(',', ':')).replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
    html = TEMPLATE.replace('__AUDIT_DATA__', payload)
    (folder / 'report.html').write_text(html)
    print(json.dumps(summary, ensure_ascii=False))


TEMPLATE = '''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google 翻译交叉核对</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f3ed;color:#272924;font:15px/1.65 system-ui,-apple-system,sans-serif}main{max-width:1680px;margin:auto;padding:30px}h1{font-size:28px;margin:0 0 8px}.sub{color:#63675f;margin:0 0 20px}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.stat{background:#fff;border:1px solid #d9ddd4;padding:14px 20px;border-radius:10px;min-width:180px}.stat b{display:block;font-size:26px;color:#235b4a}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}input,select,button{font:inherit;padding:8px 12px;border:1px solid #bdc7bb;border-radius:7px;background:#fff}input{flex:1;min-width:220px}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}.note{padding:14px 18px;background:#eaf0e9;border-left:4px solid #4c7c61;border-radius:5px}.scroll{overflow:auto;background:#fff;border:1px solid #d9ddd4;border-radius:8px}table{border-collapse:collapse;table-layout:fixed;width:100%;min-width:1100px}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #e2e5df;overflow-wrap:anywhere}th{position:sticky;top:0;background:#e7ece4;font-size:13px}th:nth-child(1){width:9%}th:nth-child(2){width:22%}th:nth-child(3){width:19%}th:nth-child(4){width:24%}th:nth-child(5){width:26%}.tag{display:inline-block;padding:1px 7px;border-radius:5px;background:#e9ece7;font-size:12px}.confirmed_mismatch{background:#f9dcd1}.needs_dictionary_check{background:#fff0bd}.google_mistranslation{background:#dde7fa}.compatible{background:#dbeede}.reason{font-size:13px;margin-top:7px;color:#50554d}.suggest{padding-top:8px;color:#235b4a}.pager{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0}.foot{font-size:12px;color:#72766d}a{color:#2b6552}details{margin-top:8px}summary{cursor:pointer;color:#526e5e}
</style><main>
<h1>Google 翻译交叉核对</h1><p class="sub">默认八库 · 英文释义 → Google 简体中文 · 与配表原中文对照</p>
<div class="note">这份报告保留真实 Google 返回结果。三个 GPT-6-Luna 子代理复查候选差异与源英文完整性疑点，主代理抽查并对少数判错结论补查词典。“仅脚本对照”表示尚未进行本轮模型语义复查；文字相近、Google 译文或模型判断都不能单独证明词典释义正确。</div>
<div class="stats" id="stats"></div>
<div class="controls"><input id="query" placeholder="搜索单词、原释义或 Google 译文"><select id="status"><option value="all">全部状态</option><option value="confirmed_mismatch">Luna 判为错配</option><option value="needs_dictionary_check">需要查词典</option><option value="different_sense_coverage">义项覆盖不同</option><option value="google_mistranslation">Google 译文有误</option><option value="compatible">复核可对应</option><option value="script_only">仅脚本对照</option></select><button id="export">导出当前筛选 JSON</button></div>
<div class="pager"><span id="count"></span><div><button id="previous">上一页</button> <button id="next">下一页</button></div></div>
<div class="scroll"><table><thead><tr><th>词条 / 证据</th><th>原英文释义</th><th>配表原中文</th><th>Google 中文译文</th><th>复查结论与建议</th></tr></thead><tbody id="body"></tbody></table></div>
<p class="foot" id="foot"></p><p class="foot"><a href="parent-quality-review.json" target="_blank">主代理抽查、裁决合并与词典依据</a></p></main><script type="application/json" id="data">__AUDIT_DATA__</script>
<script>
const data=JSON.parse(document.getElementById('data').textContent),rows=data.rows,s=data.summary;
const labels={confirmed_mismatch:'Luna 判为错配',needs_dictionary_check:'需要查词典',different_sense_coverage:'义项覆盖不同',google_mistranslation:'Google 译文有误',compatible:'复核可对应',script_only:'仅脚本对照'};
const stats=[['词条总数',s.words],['Google 成功翻译',s.translations.success||0],['候选已复查',s.reviewedCandidates+' / '+s.flaggedCandidates],['原英文完整性补核',s.reviewedSourceIntegrityCandidates+' / '+s.sourceIntegrityCandidates],['Luna 判为错配',s.reviewStatuses.confirmed_mismatch||0],['需要查词典',s.reviewStatuses.needs_dictionary_check||0]];
for(const [name,value] of stats){const box=document.createElement('div');box.className='stat';const strong=document.createElement('b');strong.textContent=value;box.append(strong,document.createTextNode(name));document.getElementById('stats').append(box)}
document.getElementById('foot').textContent=(s.complete?'采集与候选复查完成。':'进行中的快照，结果仍在更新。')+' 基线 SHA-256：'+s.sourceSha256+'；来源：'+s.provider+'。';
let page=0,filtered=rows;const pageSize=75;
function cell(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);return td}
function render(){const body=document.getElementById('body');body.replaceChildren();for(const row of filtered.slice(page*pageSize,(page+1)*pageSize)){const tr=document.createElement('tr');const first=cell(tr,row.word.toUpperCase());const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Google 原始返回';details.append(summary);for(const rid of row.requestIds){const a=document.createElement('a');a.href=row.shard+'/raw/'+rid+'.json';a.textContent=rid.slice(0,12)+'…';a.target='_blank';details.append(a,document.createElement('br'))}first.append(details);cell(tr,row.en);cell(tr,row.zh);cell(tr,row.googleZh||'尚无 Google 译文');const last=cell(tr,'');const tag=document.createElement('span');tag.className='tag '+row.reviewStatus;tag.textContent=labels[row.reviewStatus]||row.reviewStatus;last.append(tag);const reason=document.createElement('div');reason.className='reason';reason.textContent=row.reviewReason||'仅完成 Google 翻译与脚本差异筛查。';last.append(reason);if(row.suggestedZh||row.suggestedEn){const suggested=document.createElement('div');suggested.className='suggest';suggested.textContent='建议：'+row.suggestedZh+(row.suggestedEn?' / '+row.suggestedEn:'');last.append(suggested)}body.append(tr)}document.getElementById('count').textContent=filtered.length+' 条结果 · 第 '+(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/pageSize))+' 页';document.getElementById('previous').disabled=page===0;document.getElementById('next').disabled=(page+1)*pageSize>=filtered.length}
function filter(){const q=document.getElementById('query').value.trim().toLowerCase(),status=document.getElementById('status').value;filtered=rows.filter(r=>(status==='all'||r.reviewStatus===status)&&(!q||[r.word,r.en,r.zh,r.googleZh].join(' ').toLowerCase().includes(q)));page=0;render()}
document.getElementById('query').addEventListener('input',filter);document.getElementById('status').addEventListener('change',filter);document.getElementById('previous').onclick=()=>{page--;render()};document.getElementById('next').onclick=()=>{page++;render()};document.getElementById('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(filtered,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='google-translation-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};render();
</script></html>'''


if __name__ == '__main__':
    main()
