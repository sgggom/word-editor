# 默认词库双语释义与音标

2026.10.20.1 为八个默认词库提供一份共享词典。根据用户要求排除两字母词，范围为 **22,452 个去重完整单词**，包括原集合中无法用于生成的 12 个长词。未应用两字母过滤前，八库原始来源共有 22,486 次词条出现；去掉跨库重复后为 22,480 词，再排除 28 个两字母词。不合并单复数或其他词形。

原 `dict/[a-z].json` 中有 11,543 个范围内词条，直接复用已完成字段；另外 10,909 个词原先不存在。对已知错义单独记录修正，不把整批已有词重新生成。`ERINGO` 的旧中文字段只有 `=eryngo`，本次也补成实际中文。词形释义标明词根与语法关系，词条仍各自独立。

2026.10.21.1 先修正以 `CUS` 为例的 28 个已确认中英文错配，包括缩写与普通词混用、专名误配和错误词形继承。`CUS` 两种语言统一解释为 because 的非正式写法；`AHIS`、`EATS`、`MAMS`、`PECH/PECHED/PECHS` 等成对修正。核对结果保存在 `reviewed/sense-alignment.json`。

2026.10.21.2 由主代理与三个子代理按 A–D、E–L、M–R、S–Z 四个分区逐词审阅全部 22,452 词。审核针对中英文义项、词性、词形继承及可疑读音；明显误译按已有证据成对修正，罕词和读音疑点另查词典，并交叉复查了后续修订中的 103 条。新增修正位于 `reviewed/full-audit-2026-10-21/`，在旧修正和来源缓存之后应用，普通离线重建同样生效。

相对本轮审核基线，实际修改 **3,833 词**：3,435 个中文字段、3,542 个英文字段、575 个音标字段，各项可以属于同一个词。逐词结论为：18,609 条本轮未发现问题，3,824 条已解决发现的问题，19 条保留具体疑点；19 条中有 9 条已修正部分字段。未审阅词条为 0。另有 **824 条机器预测音标**仍保留 `unverified` 标识；这是读音来源统计，不等于本轮发现的 19 条疑点，也不表示已经逐一取得独立词典证实。

逐词结果、统计及未决项保存在 `audits/2026-10-21/`。`pass` 表示本轮未发现问题，`corrected` 表示已有明确修正，`pending` 表示仍有义项或读音需要进一步证据；部分 pending 已修正释义，只剩读音待核。未决条目在详情和悬停中显示“待核实”，该标记独立于原词典的音标来源。全量审阅不等于所有词义及所有方言读音均获独立词典认证，也不应将待核条目统计为全部确认。

## 查看

词库中点击词条可以查看音标、中文和英文；悬停显示简版，长释义可点击查看完整内容。两份独立 HTML 都内嵌这一范围的词典，离线查看不请求 `dict/` 分片。范围外的旧词典仍在 HTTP 环境按首字母加载。

音标保留来源方言和主要读法，不将不同词典统一伪称为同一种英音或美音：

- `sourced`：既有词典资源或源条目直接提供读音。
- `derived`：依据明确词形或异体关系及词根读音推导，界面标“推导”。
- `unverified`：eSpeak NG 1.52.0 的 `en-us` 预测读音，界面标“推测，待核实”，不能当作词典核验读音。

每类的当前数量、缺项清单和校验和保存在 `data/glossary/manifest.json`。全量字段完整不代表每个罕见词都经过人工发音核验。

## 数据文件

- `data/glossary/default.json`：唯一运行词典；`entries` 以 NFC、规范空白、小写完整字符串为键。每项是 `[ipa, zh, en, metadata]`。来源、推导词根、来源 URL 和预测引擎记录在逐字段元数据中。
- `data/glossary/manifest.json`：范围、各词库数量、去重结果、覆盖率、读音状态、数据和源文件 SHA-256。
- `data/glossary/corrections.json`：明确修正记录。中文、英文和音标各自保留来源，更新词义时不会沿用已经失效的词根关系。
- `data/glossary/reviewed/`：有来源的人工翻译、核对和少量自写简释，后续可以复用；不保存整份第三方商业词典。
- `data/glossary/reviewed/sense-alignment.json`：成对核对的中英文释义，保留逐字段来源和必要的音标修正，优先级高于旧词典及来源缓存。每条必须同时提供中文和英文。
- `data/glossary/reviewed/full-audit-2026-10-21/*.json`：完整分区审核的成对修正；修正记录说明原因，显示用释义不混入审核流程说明。
- `data/glossary/audits/2026-10-21/summary.json`：审核基线、范围、统计、修正文件哈希及运行词典哈希。
- `data/glossary/audits/2026-10-21/ledger.jsonl`：22,452 条逐词结论，包括问题、证据和实际变更字段。
- `data/glossary/audits/2026-10-21/pending.json`：仍有疑点的完整清单；不能据此声称这些词已全部修复。
- `data/glossary/sources.json`、`licenses/`：来源地址、许可证及署名。许可文本同时内嵌进分享 HTML，可在词库窗口底部展开。

词典只负责解释单词，**不改变集合运算、生成权限、用户禁表或关卡词库快照**，也不增加游戏导出字段。2026.10.20.2 已将相同的两字母排除要求应用到八个词库自身；现有 22,452 词释义完整复用，无需重新生成。

## 构建与验证

日常修改或检查已落盘的词典不需要联网：

```sh
python3 tools/build_glossary.py --check
python3 -m unittest discover -s tests -p 'test_glossary_build.py'
node tests/glossary.cjs
python3 tools/sync_editor.py
node tests/browser_glossary.cjs
```

浏览器测试需要与 README 中其余测试相同的 Chrome 和 `puppeteer-core` 环境。覆盖 HTTP、两份 `file://` HTML、八库样本、原始长词、中文/英文/音标显示、推导与预测标签、悬停、NFC 和转义。

### Google 翻译交叉核对

按用户要求，另用三个 `gpt-6-luna` 子代理对同一基线分片运行 Google 翻译核对，每片 7,484 词。`tools/google_translate_audit.py` 将已有英文释义翻译为简体中文，再与配表中文比较；调用的是 Google 的公共 Translate 端点，真实响应保存在 `outputs/google-translate-audit-2026-10-21/<分片>/raw/`。请求共用限速、保留缓存；分批标识缺失、重复或乱序时拆批重试，长释义拆分后完整保留。服务返回 403/429 时所有分片停止。

Google 译文与原中文的文字重合度只用于筛选候选，不能自动证明语义正确。候选由 Luna 逐项区分为可对应、Google 误译、义项覆盖不同、模型判为错配及需要查词典。该过程核对的是已有英文释义和中文之间的对应关系，不能独立证明英文释义本身属于该词头。完整对照、模型裁决、原始返回链接及可筛选页面通过 `tools/report_google_translate_audit.py` 汇总；最终汇总会逐条重建 Google 返回的译文，校验源文本、词条标识与内容一致。

本轮已实际取得 **22,452 / 22,452 条 Google 译文**，13,555 条差异候选全部完成逐项复查。另按 220 字符边界、未闭合括号、句尾悬空冠词或连词筛出 204 条原英文完整性候选，全部补核，并额外复核用户点名的 `CUS`。合计有 13,623 个去重词条取得本轮模型裁决；其余 8,829 条仅完成 Google 翻译及脚本对照，不能统计为第二轮逐词语义确认。

合并并抽查后的结论为：11,487 条可对应、1,179 条义项覆盖不同、433 条标为 Google 译文有误、522 条待查证或修复、2 条明确的两列描述冲突（`argal`、`piraya`）。待查项中有 193 条来自源英文残缺补核。上述类别为审阅结论，不能直接当作独立词典认证。主代理对少数判错结论补查了词典，将 `alcaic`、`ashen` 从错配改为合法义项覆盖不同；依据与重叠裁决的合并记录保存在 `parent-quality-review.json` 和 `part01/merge-receipt.json`。

该轮交付文件位于 `outputs/google-translate-audit-2026-10-21/`：`report.html` 可离线搜索、筛选及查看逐条 Google 原始返回；`all-comparisons.jsonl` 保留全量对照，`findings.json` 收集错配、待查及覆盖差异，`summary.json` 给出统计。Google 对照使用 `2026.10.21.2` 冻结基线，SHA-256 为 `ca9ca316b1e19596d6e6f509cfe372727e589f408ca58fcc0ed2dc7bcfd0027f`；原始对照记录保留，后续词典复核和实际回写见下一节。

```sh
python3 tools/google_translate_audit.py collect --audit-dir outputs/google-translate-audit-2026-10-21 --shard part01
python3 tools/google_translate_audit.py compare --audit-dir outputs/google-translate-audit-2026-10-21 --shard part01
# part02、part03 使用各自分片名称；逐项裁决写入对应目录的 review.jsonl。
python3 tools/report_google_translate_audit.py --audit-dir outputs/google-translate-audit-2026-10-21
python3 -m unittest discover -s tests -p 'test_google_translate_audit.py'
```

### 词典复核与回写（2026.10.21.3）

按后续要求，三个 `gpt-6-luna` 子代理各核查 174 条，将 Google 审计中剩余 522 条逐项查词典，并处理 `argal`、`piraya` 两处已确认问题。证据来自实际读取的 Open English Wordnet 完整数据、Wiktionary/Kaikki、Merriam-Webster、Collins、Oxford 等词典；专门用语另查 Getty、FAO、行业术语表及技术资料。ECDICT 全文用于追溯原始定义，不将同源旧中文本身当作排除疑点的证明。最后对一个分区做了独立交叉复查，主代理处理相互冲突的裁决并验证回写内容。

最终 **524 条全部有词典核对记录**：395 条已回写修正，129 条核实后保留，本轮未决项为 0。实际改变 395 个中文字段、394 个英文字段；**193 条被截断的英文释义全部补全**。合法旧义和多义项保留并标明用法，例如 `aurate` 的具耳义、`plasma` 的旧生物学义、`typo` 的旧时排字工义。未将一部词典未收录的义项直接视为错误。

本轮未改动音标，原有 19 条读音或罕词待核记录继续保留；它们不属于本轮 522 条释义疑点的未决统计。运行词条数仍为 22,452，范围外词条逐项验证未变。两份独立 HTML 已同步，运行词典 SHA-256 为 `edf4fa3619e0dd113a8dc57dd67a7bcc63448b60a3babf309a65f109c1320bd1`。

- `reviewed/dictionary-followup-2026-10-21/*.json` 保存成对修订及逐字段来源；同一天的词典复核优先于初次审阅，后续日期的审阅仍可覆盖旧修订。普通离线重建会保留这些修正。
- `audits/2026-10-21-dictionary-followup/` 保存最终统计、524 条修正前后记录及延续的待核标记。
- `outputs/dictionary-followup-2026-10-21/report.html` 提供可搜索、筛选的修正前后对照和词典来源；该目录同时保留分片证据、第二次复核及主代理合并记录。

`outputs/` 中的交付表格、报告和下载缓存保留在本地，不纳入项目提交。正式配表、修订源文件及 `data/glossary/audits/` 中的逐词记录随项目保存；运行页面和离线重建不依赖本地审阅缓存。

```sh
python3 tools/build_glossary.py --check
python3 tools/report_dictionary_followup.py --audit-dir outputs/dictionary-followup-2026-10-21
```

### 词典来源更新

补充新的来源时先导出去重工作列表，再复用缓存。源词典下载放在仓库外；地址和本次哈希见 `sources.json` 与 `manifest.json`。`glossary_english.py` 接收 ECDICT、IPA-US、OEWN 解析缓存、Wiktionary English/Scots 解析缓存及核对记录；`glossary_chinese.py` 接收相同 ECDICT/Wiktionary 证据与人工翻译缓存。两个脚本只输出缺项，不重复生成已有字段。预测音标缓存也按单词复用。

```sh
python3 tools/build_glossary.py --scope-output /tmp/word-glossary-sources/scope.json
python3 tools/glossary_english.py --cache /tmp/word-glossary-sources
python3 tools/glossary_chinese.py --sources /tmp/word-glossary-sources
python3 tools/build_glossary.py --sources /tmp/word-glossary-sources
python3 tools/sync_editor.py
```

首次解析英文 Wiktionary 压缩包可加 `--extract-wiktionary`；有意生成仍缺失的预测读音时加 `--predict-missing`，要求本地安装 eSpeak NG。完整原始包不进入项目，运行工具和分享页面不依赖 `/tmp` 或桌面源目录。重建默认拒绝缺项数据，`--allow-incomplete` 只供补全过程中的中间检查使用。

## 来源和署名

- [ECDICT，skywind3000 及贡献者](https://github.com/skywind3000/ECDICT)：MIT；复用中英文释义、音标和 `exchange` 明示词形。
- [Open English WordNet 2025+](https://en-word.net/)，Open English WordNet Team；基于 Princeton University WordNet：CC BY 4.0 与原 WordNet License。复用英文词义。
- [ipa-dict，open-dict-data](https://github.com/open-dict-data/ipa-dict)，及其 [cmudict-ipa](https://github.com/menelik3/cmudict-ipa)、[CMUdict，Carnegie Mellon University](https://github.com/cmusphinx/cmudict)：MIT / BSD。复用源读音；格式转换不代表重新人工核验。
- [Wiktionary 编者](https://en.wiktionary.org/)，经 [Kaikki / Wiktextract](https://kaikki.org/dictionary/) 提取的 English 与 Scots 数据：CC BY-SA 4.0。英文释义、部分音标、词形关系及对应中文改编沿用该许可；词条地址保留在来源记录或可由完整词头定位。
- [Merriam-Webster 官方 Scrabble 词典](https://scrabble.merriam.com/)：仅用于少量难词的词形/词义核对，再独立编写简短中英释义；逐条核对页面见 `reviewed/english-reviewed.json`，没有把商业词典作为开放许可原库分发。
- [Collins](https://www.collinsdictionary.com/)、[Cambridge](https://dictionary.cambridge.org/)、[Dictionaries of the Scots Language](https://dsl.ac.uk/)：用于部分疑点核对和少量音标；释义使用简短独立改写或翻译，具体依据保存在本轮修正的字段来源中。
- [eSpeak NG](https://github.com/espeak-ng/espeak-ng)：仅在开发时生成明确标注的预测 IPA，不随网页分发语音引擎。

本次去掉重复处理、补译、格式整理及词形简释属于对相应源材料的改编。Wiktionary 改编部分使用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；OEWN 改编保留 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 署名。
