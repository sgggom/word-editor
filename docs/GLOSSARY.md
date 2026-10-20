# 默认词库双语释义与音标

2026.10.20.1 为八个默认词库提供一份共享词典。根据用户要求排除两字母词，范围为 **22,452 个去重完整单词**，包括原集合中无法用于生成的 12 个长词。未应用两字母过滤前，八库原始来源共有 22,486 次词条出现；去掉跨库重复后为 22,480 词，再排除 28 个两字母词。不合并单复数或其他词形。

原 `dict/[a-z].json` 中有 11,543 个范围内词条，直接复用已完成字段；另外 10,909 个词原先不存在。对已知错义单独记录修正，不把整批已有词重新生成。`ERINGO` 的旧中文字段只有 `=eryngo`，本次也补成实际中文。词形释义标明词根与语法关系，词条仍各自独立。

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
- `data/glossary/sources.json`、`licenses/`：来源地址、许可证及署名。许可文本同时内嵌进分享 HTML，可在词库窗口底部展开。

词典只负责解释单词，**不改变集合运算、生成权限、用户禁表或关卡词库快照**，也不增加游戏导出字段。2026.10.20.2 已将相同的两字母排除要求应用到八个词库自身；现有 22,452 词释义完整复用，无需重新生成。

## 构建与验证

日常修改或检查已落盘的词典不需要联网：

```sh
python3 tools/build_glossary.py --check
node tests/glossary.cjs
python3 tools/sync_editor.py
node tests/browser_glossary.cjs
```

浏览器测试需要与 README 中其余测试相同的 Chrome 和 `puppeteer-core` 环境。覆盖 HTTP、两份 `file://` HTML、八库样本、原始长词、中文/英文/音标显示、推导与预测标签、悬停、NFC 和转义。

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
- [eSpeak NG](https://github.com/espeak-ng/espeak-ng)：仅在开发时生成明确标注的预测 IPA，不随网页分发语音引擎。

本次去掉重复处理、补译、格式整理及词形简释属于对相应源材料的改编。Wiktionary 改编部分使用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；OEWN 改编保留 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 署名。
