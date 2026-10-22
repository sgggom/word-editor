# 字页关卡台

关卡编辑、竞品浏览、试玩与游戏导出工作台。词库来自 7 款游戏的已校准主线资源，可分别配置必答候选池和额外词池，用交集或并集建立自己的词库。

## 打开和运行

双击 `wordpages-level-desk.html` 即可离线配置词库、生成关卡和查看默认 8 个词库中三字母及以上单词的双语释义与音标，无需安装应用依赖。需要默认范围外的旧释义、完整来源关卡或竞品关表时，在仓库根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

打开 [本地项目](http://127.0.0.1:8000/) 。`index.html` 与 `wordpages-level-desk.html` 内容相同，GitHub Pages 使用前者。首次打开默认加载用户提供的“示例关序”100 关，从第 1 关开始；已有浏览器存档时恢复存档。关卡台文件和游戏关卡文件统一通过顶部“打开”载入。编辑撤销使用 ⌘/Ctrl+Z。`?fresh=1` 打开空白关序，`?sample=1` 重新加载这 100 个默认关卡；词库配置独立保存在当前浏览器和站点地址下。

已有本地关序时，点击“打开历史 → 默认关卡 → 导入”即可切回默认关卡。默认入口固定在历史列表第一项，不可删除；确认后替换当前关序并从第 1 关开始，取消保留现有关卡，也可用 ⌘/Ctrl+Z 撤销切换。原历史文件记录继续保留。

关卡编辑使用列表每行的“编辑”，在棋盘面板点击“返回列表”结束编辑。游戏关卡导出入口位于“关卡排布”窗口底部的“导出当前正式关序”。

## 词库配置

点击“词库”，通过“当前词库”切换配置。点击“新建词库”或“复制词库”后，在弹窗中输入名称并确认创建；已有词库点击“重命名”修改名称。弹窗支持回车确认、取消和空名称校验，确认后立即保存创建或重命名结果；范围修改仍需点击“保存配置”，重命名会保留尚未保存的范围修改。查询词条使用词条区域的“查找单词”。必答候选池与额外词池分别设置来源及交集／并集，也可在饼图中多选区域：

- 每个来源可选择整款游戏或具体版本，并独立勾选 `target / extra / onlyExtra / bonus`。整款游戏内部先合并全部版本，单个来源内部先合并所选词类。需要比较同一游戏的两个版本时，添加两个来源项。
- 并集表示任一来源出现即可；交集表示每个来源都出现。空来源列表得到空集合。重复添加同一来源不增加词数。
- 支持保存、复制、删除、设为默认及 JSON 配置导入导出。更改后点击“保存配置”才会供生成使用；配置导出也可保存尚未提交的有效配方。
- 预览显示原始词池、重叠、生效必答、生效额外、不适用及禁表降级数量。空配置可以保存，没有生效必答时不能生成。
- 浏览范围可选配置结果、全部 32,268 个来源词条或本关快照；支持游戏、版本、来源词类、配置用途、精确／前缀／包含／通配查询和 CSV／TXT 导出。
- 展开词条可查看完整游戏、版本和关卡出处，保留 Crossword Go 的填空补全、原始 ID、Word Search Explorer 的分片及相同资源别名。详情按需加载，需要 HTTP 服务。

预建列表为 **8 个分级词库**，均使用 Word Tiles、Zen Word、Words of Wonders、Wordscapes 的全部版本。每档分别保存一份必答词库和一份仅额外词库，选中对应的精确重叠区域：

| 等级 | 所在游戏数量 | 生效必答 | 生效仅额外 |
|---|---|---:|---:|
| 核心 | 4 款共有 | 1,627 | 177 |
| 一级 | 恰好 3 款 | 1,736 | 1,509 |
| 二级 | 恰好 2 款 | 2,643 | 4,591 |
| 三级 | 恰好 1 款，各游戏独有区域合并 | 4,742 | 5,415 |

必答按 `target` 词类出现的游戏数量分级。仅额外合并 `extra / onlyExtra / bonus`，先剔除四款游戏所有有效必答候选，再按额外来源的游戏数量分级。8 份配置的两池均排除两字母词，过滤在集合分区前执行，列表、饼图、CSV／TXT 和生成的范围一致。生效词互不重叠，合计 10,748 个必答候选和 11,692 个仅额外词。超出生成词长的原始词仍保留供浏览：三级必答有 4 个，三级额外有 8 个，合计 12 个。

默认选择“核心 · 必答词（4款共有）”，独立校验器默认词表与其一致。仅额外词库在生成时可与必答词库分别勾选搭配，必答组需要有生效候选。“新建词库”仍预填四游戏的目标词并集与额外词并集，便于创建组合配置。

本次升级首次打开会按要求清除旧配置列表并替换为这 8 份，已有关卡使用的快照保留。替换只执行一次，之后用户新增、改名、删除和默认选择均按保存结果恢复。2026.10.20.2 仅为仍存在的八个预设 ID 添加两字母排除规则并增加配置版本，保留已有编辑、其他自定义配置及批量选择；已删除的预设不会被重新添加，已有关卡快照不重写。列表中的“剔除所选游戏全部版本的必答候选”选项控制仅额外规则，饼图也显示剔除后的集合。

## 配置视图：列表与饼图

“列表”和“饼图”是同一份词库配置的两种编辑视图，切换视图保留所选范围。两个词池各自配置来源和区域，保存后直接用于生成关卡。

- 列表中可选择游戏、版本、词类及并集／交集。切到饼图后，并集对应全部区域已选，交集对应共同区域已选。
- 点击饼图的圆形区域、区域数字或下方精确区域项来选中，再次点击取消；可同时选中多个区域。选中的互斥区域合并为该词池，取消的区域不会进入该词池。
- 提供“全选 · 并集”“仅共同区域 · 交集”和“清空选择”。清空后是空词池；必答池没有生效候选时不能生成。
- 手动选择后，配置方式显示为“区域多选”。列表会显示已选区域数量，并提供返回饼图编辑的入口。改变该词池的游戏、版本或词类后，会清空该池的区域选择并提示重新选择；另一个词池保留原选择。重复添加完全相同的来源不改变区域。
- 右侧列出所选区域合并后的词条，支持查词、出处和 CSV／TXT 导出；“查看生效”可进一步查看通过词长与用途规则的词。
- 保存、复制、JSON 导入导出、刷新和离线 HTML 都保留区域选择及对应来源。生成的关卡固定保存这份区域配置和生效词表快照。

圆面积与对应来源词数成比例。三圈及以上的几何交叠是近似布局；区域数字、组合列表和词表均按真实集合精确计算。无法单独画出的区域可以在下方列表选择，也会计入配置。额外词仍遵守必答优先规则，未用作本关必答的可达候选也可成为额外词。

相同来源在图中合并，不同版本作为独立来源。1–7 个来源使用圆形图，更多来源使用同样可多选的精确区域列表。词库与图形代码均内嵌，不依赖额外网络资源。

## 数据与生成权限

| 游戏 | 去重词条 |
|---|---:|
| Word Connect Association | 14,644 |
| Word Search Explorer | 6,936 |
| Crossword Go! | 1,930 |
| Wordscapes | 16,354 |
| Words of Wonders | 17,224 |
| Zen Word | 6,534 |
| Word Tiles | 6,000 |

总计 7 款游戏、25 份配置或资源版本，跨游戏去重为 32,268 个词条；各行数量不能直接相加作为去重总数。Word Search Explorer 的重复副本已归为三组；Crossword Go 未映射资源保留原 ID，缺失关卡没有补造。这里只收录取得的英文主线，旧竞品浏览中的每日关不是词库配置来源。

迁移基准是 `leveleditor` 中已校准分享页的 `DATA`，保留 Word Connect 单词筛选、Crossword Go 答案补全及逐角色关卡引用。词条统一 Unicode NFC、大写与空白，不做词干合并、单复数合并、重音去除或短语拆词。

必答候选使用 `A–Z`、3–8 字母，额外认可词使用 `A–Z`、2–8 字母。不适用词仍能浏览和导出。两池重叠时，符合必答要求的词优先成为候选。用户缩写禁表把命中的候选降为额外；此规则在生成或显式切换本关词库时写入快照。

本关额外词为棋盘上所有可达生效词减去本关必答，包括未被选为必答的候选。额外词池不是每一关额外列表的唯一来源。

原 9,455 词库及其 pending、lemma、基础词、旧竞品审核和打分字段退出当前生成与界面。历史资源保存在 `archive/legacy-vocabulary-2026-10-19/`。`src/lex.json` 现在由新默认配置生成，不再手工编辑。释义资源不决定词库权限，竞品目标身份不代表已测的人群熟悉度。

## 关卡生成 → 关卡库 → 关卡排布

顶部的“关卡生成”和“关卡排布”是两个独立入口。流程为：来源词库 → 批量生产 → 命名关卡库 → 按规则排布 → 确认应用为正式关序 → 编辑、试玩、导出。生成与排布预览都不覆盖当前关序，默认 100 关、历史入口和原词库配置继续保留。关卡库初始为空，不自动迁入当前关序。

**关卡生成**中先创建或选择目标关卡库。来源的必答和仅额外两组分别多选，同组取并集，重叠词优先作为必答，再按本机缩写禁表降级。未选为本关必答的可达候选仍可作为额外词。必答组至少需要一个生效词，额外组可不选；配置和快照在本次生成开始时固定。

每行生产批次固定棋盘尺寸、目标词数和数量，支持多行。尺寸为 4×2、3×3、4×3、5×3，目标词数 2–16；默认生产 1000 关，单次最多 10000 关，可以继续追加。总尝试预算留空时为目标数量 × 300，失败和重复候选不计入成功数。达到数量、预算用完或中止后保留已入库结果。同一输入、种子及候选范围不受线程数、返回顺序影响；追加同种子的同规格批次会接着上次候选编号继续。

生产使用显式尺寸和目标词数，不再用正式关号决定生成阶段或词库解锁。构盘参考 list0 中“目标词数差、格数差、模板顺序”最接近的模板，复用铺盘、扫描、选词、全盘覆盖、路径用格一致性和逐格次数校验。所有通过校验的候选均可入库，不再只保留一轮评分最高的一关。生产时不应用逐关字母表、拐弯上限、重复词间隔或字母密度限制。

计算线程支持自动、1、2、4、8。自动按逻辑处理器数减一选择，最多 4 个；手动选择也受设备线程数限制。线程不可用、启动超时或运行异常时自动分段单线程回退。后台源码已内嵌，两份独立 HTML 在 `file://` 下也可使用。

关卡库独立保存在 IndexedDB `wp.leveldesk.pools`，分批写入、每页 50 关。每关有完整九字段棋盘数据、候选 ID、来源与共享词库快照引用，以及逐词最少拐弯数、直线／一拐／二拐及以上数量。支持命名、重命名、预览、试玩、导入、导出及合并。相同候选合并去重，导入重新计算指标和校验内容，不信任文件中的统计值。

**关卡排布**先配置分段及各段可使用的一个或多个关卡库，再展开为逐关表。每关尺寸和目标词数必须事先确定，可单独修改；首次进入会提取当前关序的尺寸和目标数，也可重新读取。修改分段后，原有逐关修改保留，点击“将本段尺寸、目标数覆盖到逐关表”可批量覆盖。

| 规则 | 默认及统计口径 |
|---|---|
| 尺寸、目标数 | 精确匹配逐关表 |
| 必含字母 | 使用原 1–1000 关表，按最终关号匹配；整盘包含全部要求字母即可，不要求每词包含；1001 关起不限 |
| 每词最大拐弯 | 默认 1 拐，按最少拐弯的合法路径计算，可设不限 |
| 二拐及以上词数 | 可另设上限，默认不限 |
| 重复词间隔 | 默认严格 20，即两次出现之间至少隔 20 关；只统计必答词，0 关闭，可改扣分避让 |
| 字母密度 | 默认窗口 20，A–Z 上限留空即不限；按整盘是否包含统计，同一关同一字母只计一次，可严格限制或扣分 |

跨分段继续统计历史，使用当前关号所属分段规则。开头不足完整窗口时仍使用配置上限；缺位保留正式关号，不贡献单词或字母统计。同一关卡在一套关序中最多使用一次，不同方案可复用库存，排布不会删减关卡库。

排布先筛选静态条件，再处理重复词和密度，结合稀缺候选检查与有界回退。软规则按违反条件数量等权扣分，种子稳定决定候选顺序。默认最多检查 100 万次候选，在后台线程计算，可取消或换种子重试。未匹配位置继续保留，不压缩编号、不自动放宽条件、不调用生成器补位。

预览显示逐关结果、符合静态条件的库存数、缺口原因、路径和窗口统计。缺口区分静态库存不足、当前搜索被间隔／密度排除、候选已占用和预算内尚未匹配；有界搜索未完成不代表无解。只有全部关号匹配且复核通过，才能点击“应用排布结果”并确认替换正式关序；可撤销。应用会复制关卡和所需快照，保留来源库与候选 ID，库存不变。

排布方案和上次预览分别保存；新正式关序另带当次规则快照。手动编辑后重新计算指标，游戏导出前复核绑定规则。旧默认关卡和旧存档不会自动绑定新的拐弯、间隔或密度限制。

## 快照与文件

| 文件类型 | 入口与用途 |
|---|---|
| `wordpages-level-pool`，schema 1 | 关卡生成中的导入／合并、导出；完整库存与共享词库快照 |
| `wordpages-arrangement`，schema 1 | 关卡排布中的方案导入、导出；分段、逐关修改、规则及字母表快照，引用关卡库 ID |
| `wordpages-desk`，schema 2 | 顶部打开／保存；正式关序、所需词库快照及可选排布绑定 |
| `wordpages-library` | 词库配置导入／导出；来源配方与编译快照 |
| 游戏文件 | `{books, daily}`；每关仍只有 `id, name, g, t, n, e, lv, ty, curtains` 九字段 |

换浏览器或设备时，导出关卡库与方案并分别导入；正式关序单独用关卡台文件保存。HTTP 站点与离线文件的浏览器存储隔离，文件导入导出可在两者间迁移。

词库快照包含配方、数据指纹、生效词表及当时缩写禁表，关卡通过 `librarySnapshotId` 引用。生成组合的 `recipe.kind` 为 `library-selection`，`recipe.selection.target / extra` 保存两组完整配置及版本。源词库修改、删除或更改默认值不重写已有快照。新建手工关卡仍使用当前默认词库；“切换本关词库”可显式重新绑定、校验并撤销。旧导入关的棋盘、必答与额外词保留；没有新排布绑定的文件沿用原有兼容规则。

逐关字母表来源为用户 Excel“关卡配置”工作表实际单元格，已存为 `data/required_letters.json` 并内嵌。仅使用关号与字母，统计页配额及去重说明不增加棋盘限制。更新该表时运行：

```bash
python3 tools/import_required_letters.py /path/to/word_tiles_letters_1_1000.xlsx
python3 tools/import_required_letters.py /path/to/word_tiles_letters_1_1000.xlsx --check
python3 tools/sync_editor.py
```

实现、文件结构与万关验收结果见 [关卡库与排布说明](docs/INVENTORY_ARRANGEMENT.md)。

## 数据同步和开发

`src/library.js` 是浏览器与 Node 共用的集合编译器；`src/library_runtime.js` 管理词库快照和保存。`src/gen.js` 提供独立候选尝试，`src/batch_generator.js` 与 `src/batch_worker.js` 管理生成线程及回退。旧顺序生成和 `src/library_schedule.js` 的 API 保留供历史文件与引擎回归使用，新的生产界面不依赖正式关号。

`src/level_pool.js` 负责库存校验与指标，`src/pool_store.js` 负责独立数据库；`src/arrangement.js` 与 `src/arrangement_worker.js` 负责可复现的排布。两套工具界面源为 `src/inventory_ui.js`、`src/arrangement_ui.js`、`src/workflow_panels.html` 和 `src/workflow_panels.css`；原编辑器其余 UI 源保留在 `index.html`。同步脚本内嵌模块、线程源码、面板和版本，输出两份相同 HTML。

仅修改编辑器功能时使用以下命令，避免将正在修改的词库或审核数据写入发布 HTML：

```sh
python3 tools/sync_editor.py --editor-only
```

需要更新词库数据时才使用 `python3 tools/sync_editor.py`。完整模式会重建默认 `src/lex.json` 并刷新所有内嵌数据。出处数据位于 `data/game_vocab/*.json.gz`，校验和在 `manifest.json`；应用运行不依赖迁移源目录。

需要重新迁入同口径校准数据时：

```sh
python3 tools/import_game_vocab.py /path/to/词库交叉可视化_单文件分享版.html
python3 tools/import_game_vocab.py /path/to/词库交叉可视化_单文件分享版.html --check
python3 tools/sync_editor.py
```

数据版本改变时旧关卡快照仍可独立使用；旧配方 JSON 不会静默套用不同版本数据。迁移脚本只读源 HTML，不执行其中代码、不改源目录。

## 验证

```sh
node tests/library_sets.cjs
node tests/library_combinations.cjs
node tests/library_schedule.cjs
node tests/library_overlap.cjs
node tests/generation_attempts.cjs
node tests/pool_arrangement.cjs
node tests/required_letters.cjs
python3 tools/build_glossary.py --check
node tests/glossary.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/generate_libraries.cjs
node src/nodetest.js 30 list0 /tmp/v2-list0.json
python3 verify/verify_levels.py /tmp/v2-list0.json --report /tmp/v2-list0-report.json
```

`generate_libraries.cjs` 用四档必答词库、跨游戏交集和七游戏并集在两套主线早／中／后期尝试 108 关，将成功关卡、对应词表和明确失败结果写入 `/tmp/word-library-validation/`。互斥的一级至三级不含核心词，部分高必答数阶段可能无法生成，仍保留原来的约束与失败处理。默认核心和两套自定义范围继续要求全部成功。独立 Python 校验器用 `--lex 对应词表.json` 检查权限、额外词完整性、用格一致性、覆盖与次数；有幕布的关卡仍需单独验证。

浏览器验收需要仓库外安装 `puppeteer-core` 和 Chrome／Chromium，并先启动 HTTP 服务：

```sh
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_inventory_arrangement.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_v2.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_history_default.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_batch_workers.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_required_letters.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_libraries.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_library_range.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_batch_libraries.cjs
NODE_PATH=/path/to/node_modules CHROMIUM_PATH=/path/to/chrome node tests/browser_library_schedule.cjs
```

万关验收先运行 `node tests/inventory_scale.cjs` 生成真实库存文件，再运行 `node tests/browser_inventory_scale.cjs`，浏览器依赖和环境变量同上。

`BASE_URL` 可覆盖服务地址。浏览器测试覆盖配置管理、集合计算、快照版本、旧存档、文件往返、真实出处、两字母额外词试玩、离线 HTML 和桌面界面，截图及结果写在 `/tmp`。历史截图、旧审核、旧 320 关数据不代表当前词库验收结果。

## 来源与署名

生成引擎及阶段目标沿用 Word Tiles v2 交接包；当前词库来自用户提供的 `leveleditor` 校准数据。它是已取得竞品主线中的词条集合，并非游戏客户端完整字典，也不等于逐词人工确认的常用词白名单。

默认 8 个词库共用一份 **22,452 词**的内嵌词典，排除 28 个两字母词；原始范围中的 12 个长词也保留释义。以 NFC、大小写和空白规范化后的完整单词去重，不合并词形。原有 11,543 个词的释义直接复用并修正发现的错义，另补 10,909 个词；一个词只维护一份中英释义与音标。点击词条或悬停即可查看，分享 HTML 后同样可用。

音标区分词典记录、明确词形关系推导和语音引擎预测；预测读音标为“推测，待核实”。释义不参与生成权限、词库集合计算和快照哈希。数据、逐字段来源、修正记录、许可和增量构建方法见 [词典说明](docs/GLOSSARY.md)。新增浏览器验证为 `node tests/browser_glossary.cjs`；两字母规则升级回归为 `node tests/browser_library_short_words.cjs`，使用与其余浏览器测试相同的环境变量。

词典署名：ECDICT（MIT）、Open English WordNet / Princeton WordNet（CC BY 4.0 / WordNet License）、ipa-dict / CMUdict（MIT / BSD），以及改编自 Wiktionary 的释义（CC BY-SA 4.0）。少量罕见词经 Merriam-Webster 核对后另行编写简释。版本历史由 `src/version_history.json` 管理。
