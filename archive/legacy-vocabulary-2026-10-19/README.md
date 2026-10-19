# 字页关卡台

保留原有关卡编辑、竞品浏览、试玩、存档和游戏导出界面，生成器及词库已切换为交接包的 **Word Tiles v2**。

## 打开和运行

双击 `wordpages-level-desk.html` 即可使用内置生成器；无需构建或安装应用依赖。
要使用按需加载的词典释义和竞品数据，请在仓库根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

`index.html` 与 `wordpages-level-desk.html` 内容相同。GitHub Pages 使用根目录的 `index.html`。首次打开为空关；「加载示例」加载 20 个 v2 示例。关序继续保存在浏览器 IndexedDB。`?fresh=1` 本次跳过旧存档，`?sample=1` 加载示例。

## v2 词库

`src/lex.json` 保留交接包的 9,455 条词库记录及 `word / role / grade / reason / lemma / wtRole / zenRole / evidenceCount / priority` 原字段，并逐词添加 `selectionAudit` 竞品出题证据。

| 权限 | 数量 | 用法 |
|---|---:|---|
| candidate | 4,600 | 必答候选；生成时限制 3–8 字母 |
| extra | 2,595 | 仅作为额外词 |
| pending | 2,260 | 待审核，不参与生成、额外词扫描或建议 |
| blocked | 0 | 屏蔽权限，数据模型支持；当前源词库没有此类记录 |

candidate 中有 834 个“基础”候选，其余 3,766 个标为“竞品必答候选（熟悉度未测）”。**这些标签不是已测的常见度或罕见度**。界面不再沿用旧版五档词频，罕见度图表停用；结构难度分按词数、格数、最长词和路径四项计算，不能与旧版含词汇项的分数直接比较。

## 竞品出题证据审核（2026-10-19）

审核面向普通英语母语成年玩家，以 Word Tiles 两套各 1,500 关主线为主要依据。Zen 五套各 1,000 关与 WT 的 365 个每日关分别作为旁证。**角色稳定性是观察结果，不是人群熟悉度等级。**

| WT 主线证据分类 | 全词库词数 | 含义 |
|---|---:|---|
| 稳定必答 | 4,002 | 在已收录 WT 主线里只出现为必答；单次观察仍标低可信度 |
| 条件必答 | 50 | 必答与额外间切换；均为三字母倒读词对 |
| 稳定额外 | 1,948 | 在已收录 WT 主线里仅出现为额外，不等于生僻 |
| 证据不足 | 3,455 | WT 主线中未收录；可继续查看 Zen／每日关旁证 |

词库支持按上述分类、证据可信度、专项复核、跨游戏用途差异和建议权限差异筛选。详情展示词次、不同配置数、样本关号、三字母倒读取舍、最低词长排除记录及逐词复核依据；导出 CSV 同时保留当前权限和建议权限。

关键复算结果：50 个条件必答词作为额外出现的 946 次均能由同关三字母反向必答解释。另有 87 关中的 538 个可达候选词次都是三字母词，而这些关卡的必答与额外列表均只收录四字母及以上词。该结果使用全样本已知候选池回溯枚举，不是独立留出测试，也不是取得了竞品官方代码。四字母及以上的倒读词不能套用三字母取舍规则。

可信度是证据强弱的产品分档：至少 5 个不同配置且覆盖两套 WT 主线为高，至少 2 个不同配置为中，仅 1 个为低，没有 WT 主线记录则显示无主线证据。它不是认识率或统计置信概率。不同配置按棋盘／字母袋、必答集合和额外集合识别；Zen 相同配置跨版本只计一次，同字母袋而答案不同的配置仍分别计数。源字段中同时出现在必答与额外的词优先计必答，避免重复。

`selectionAudit.recommendation` 给出面向 WT 风格的建议：已知 WT 必答作为候选，WT 仅额外作为额外，缺少 WT 主线依据暂不升级；原有 `lemma` 隔离、3–8 字母范围和已有屏蔽要求优先。**建议与现行 `role` 分列，本次审核不会自动改写生成权限、基础标签、存档或游戏导出等级。** 生成时仍可选到建议待审核的原候选，筛选“建议与当前不同”即可定位；这些词不能据此宣称完成了上线词库验收。

对 127 个边界词补充了文本复核：包括词典缩写提示、独立词义与变化形式、缺失释义、跨游戏差异和熟悉度边界。`CAFE / ENTREE / INTRO / SITCOM` 不因缺失释义或缩短词来源被自动排除；`DEVINE` 保留原记录，建议暂缓作为必答。其余词典提示仅作为核对线索，不能自动认定为专名、缩写或无效词。

- `data/word_audit_reviews.json`：逐词复核说明和词典来源；是 Codex 文本复核，不是母语玩家实测。
- `data/word_audit_summary.json`：全量统计、87 关词长排除明细及输入 SHA-256。
- `tools/audit_word_selection.py`：仅用 Python 标准库复算。`--check` 校验结果而不写文件。

```sh
python3 tools/audit_word_selection.py
python3 tools/sync_editor.py
python3 tools/audit_word_selection.py --check
```

## 词库权限与兼容性

词库浏览展示全部 9,455 条，包括待审核词；玩法可接受词集依照 v2 `buildIndex`，只含无 `lemma` 的 candidate / extra。`DOS` 为 extra，`GOOS`、`HOTS` 为 pending，不会生成到必答中。candidate 身份仍不保证排除了所有缩写、专名、专业词或不熟悉词，后续审词需要更新权限。

「缩写禁表」继续作为用户附加排除：将命中的 candidate 降为仅额外，不改变源词库。旧存档不会自动删除或重写，旧关卡里不符合新权限的必答会显示警告。`src/policy.json` 的旧名单已清空，v2 权限是词库依据。旧单复数例外设置保留以兼容存档，不参与 v2 选词；v2 的 `lemma` 记录和 pending 隔离负责词形初筛。

## 批量生成

选择 `list0` 或 `list5` 主线、起始关号、数量、种子、尝试次数、近期重复窗口、额外词偏离惩罚和单格次数上限。可插在当前关后，或替换关序。

- `src/profiles.json` 包含两套主线各 13 个阶段的目标，覆盖 1–1500 关；更远关号沿用末段。
- 词沿上下左右路径铺入棋盘，单词内不重复用格；填盘后从可达 candidate 中选择必答，覆盖每一格。
- 每个必答的所有已扫描合法路径必须使用同一组格子。次数由这些必答路径逐格叠加，从而确保找词顺序不改变消耗预算。
- 多次构造候选盘，按直线率、拐弯、词长、字母种类、最大叠层、拼写包含关系、额外词负担等评分择优。引擎保留附件原版的方向与邻接评分逻辑；默认未注入专门的邻接权重表。
- 20 关冷却默认是**评分扣分**，不是硬排除；额外词数量也是软目标。
- 失败不自动降低难度或安全条件。全部失败或尚未生成就中止时保留现有关序；部分成功时按已选插入/替换模式接纳成功结果，并列出失败关号。

生成核心 `src/gen.js` 直接来自交接包 `src/engine.js`。当前编辑器的旧路径搜索辅助只用于手工关卡分析和额外校验，不再用于生成。

## 保存、导入和游戏导出

原有存档、Word Tiles / Zen 浏览、手工编辑、试玩皮肤与提示继续可用。生成器模型经 `src/v2_adapter.js` 转为现有棋盘及次数格式。

「导出游戏关卡」仍输出 `{books, daily}`；每关保留 `id, name, g, t, n, e, lv, ty, curtains` 字段。v2 没有已测罕见度，新关卡 `lv` 留空；未修改的导入关卡继续保留原始等级和分册信息。新分册的 `mix` 在缺少等级时保留兼容默认值 `[100,0,0,0,0]`，它不代表实测词汇比例。

`dict/` 继续用作释义资源，词典文件是否有释义不影响 v2 权限，新增词可能没有释义。竞品数据仍从 `data/competitor/*.json.gz` 按需加载。

## 开发与验证

修改生成核心、适配层、词库或配置后，刷新内置资源：

```sh
python3 tools/sync_editor.py
```

UI 源在 `index.html`；同步脚本将生成资源内嵌到页面、更新另一个 HTML 副本，并同步 `src/batch_ui.js`。两个 HTML 都保持可独立运行。

生成与独立验证无需第三方依赖：

```sh
node src/nodetest.js 300 list0 /tmp/v2-list0.json
node src/nodetest.js 300 list5 /tmp/v2-list5.json
python3 verify/verify_levels.py /tmp/v2-list0.json --report /tmp/v2-list0-report.json
python3 verify/verify_levels.py /tmp/v2-list5-game.json --report /tmp/v2-list5-report.json
python3 -m unittest discover -s tests -p 'test_*.py'
```

Python 校验器独立枚举路径，检查权限、用格一致、覆盖、次数和额外词完整性；接受 v2 引擎结果、游戏关卡数组及 `{books,daily}`。不支持幕布关卡的安全证明；v2 生成器本身不生成幕布。`sample_320_levels.json`、`verify/report_320.json`、`verify/negative_samples.json` 和旧截图是历史资料，不代表当前 v2 词库下的验证结果。

浏览器回归需要 Chromium 与 `puppeteer-core`，可在仓库外安装，避免添加应用依赖：

```sh
npm install --prefix /workspace/setup-tools --cache /workspace/setup-tools/npm-cache --no-audit --no-fund --save-exact puppeteer-core@24.37.2
# 在另一个终端启动上面的 HTTP 服务后运行：
NODE_PATH=/workspace/setup-tools/node_modules node tests/browser_v2.cjs
```

可以通过 `BASE_URL` 和 `CHROMIUM_PATH` 覆盖测试地址及浏览器路径。测试覆盖双主线与 Node 引擎的一致性、3 关拖动通关、修改撤回、游戏导出导入、持久化、失败保留和独立 HTML 副本运行（云端 Chromium 禁止 `file://` 时通过 HTTP 验证该副本）。结果与截图写在 `/tmp`。

原 `src/headless_test.js`、`shots/layout_test.js` 是包含旧绝对路径的历史脚本，请使用新的回归入口。

## 来源

v2 核心、词库和阶段配置取自用户上传的 `WordTiles_Work完整交接包_v2_含下载清单.zip` 中 `WordTiles_关卡工作台_v2/`。词库为竞品出现词集合及建议权限，不是客户端完整字典，也不是人工确认的常用词白名单。词典释义仍采用原仓库资源及其原有许可要求。

词典署名：ECDICT（MIT）、Open English WordNet（CC BY 4.0）、CMUdict（BSD），以及部分改编自 Wiktionary 的英文释义（CC BY-SA 4.0）。

版本历史维护在 `src/version_history.json`，最新版本放在第一条。新增改动后递增当天序号并运行 `python3 tools/sync_editor.py`，自动同步左上角版本号、提示及弹窗内嵌数据。
