# Mongology 离线复用检查与接入合同草案

日期：2026-09-27。范围：Owner 在 OCR 规划讨论后要求继续，完成本地已有资产的运行检查、合成推理与接口差距核查。探针最初在旧工作区执行；独立引擎与权重身份见证据，平台接口方案现按 vNext `7bb7959` 修订。本记录支持规划和下一步原型设计，不是生产发布或真实整书质量验收。

## 结论

现有 Mongology 可以作为独立 OCR 候选引擎复用。两个本地 checkpoint 均可在现有 Windows CPU 环境加载，48 项相关原有测试通过。需要增加页清单、源版本映射、模型精确身份和严格结果校验，才能进入 AcademicCloud 的 Local Compute 接入原型。

蒙古文拉丁转写与西文学术模型应分别保留能力声明；现有字表不支持把任意蒙古文或汉文直接送入这两个模型。汉文主线见[产品规划的汉文接入方案](ocr-product-plan.md#45-汉文识别与统一接入)。

## 1. 本次实测证据

原工程：`C:\Users\35326\Documents\Codex\mongology-academic-ocr`。使用其中现有 `.venv_training`，未安装或下载依赖。运行环境为 Python 3.12.14、Torch 2.12.1+cpu、Pillow 12.2.0、PyMuPDF 1.27.2.3、NumPy 2.4.6。

### 原有测试

在原工程目录，以 `PYTHONPATH=src;tests`、`PYTHONDONTWRITEBYTECODE=1`、OMP/MKL 线程数 2 运行：

```text
python -m unittest -v test_pipeline test_grouped_split test_text_normalization test_training_quality test_torch_smoke
```

结果：**48/48，通过，14.471 秒，无跳过**。覆盖合成 PDF/图像与训练数据、布局坐标、导出、校勘、分组拆分、规范化和 Torch CLI。部分测试会在自动清理的临时目录内训练极小合成模型；未重训或覆盖现成模型，未处理 Owner 学术原件。

### 已发布模型的合成推理

使用[可重复执行的探针](../../scripts/ocr/probe-mongology-offline.py)，每个模型运行相同的 13 条输入：两个字体各 6 条自造文字，另加一张空白图。推理输入不包含参考答案；固定 CPU 两线程、batch size 1、48 像素行高。checkpoint 以 weights-only 方式加载，前后 SHA-256 一致。

| 模型 | 权重大小 | 字表字符数 | 加载耗时 | 13 行推理（含再次加载与 I/O） |
|---|---:|---:|---:|---:|
| Mongolian Latin v0.2 | 10,604,409 B | 158 | 0.0242 s | 0.2429 s |
| Latin Scholarly managed best | 21,484,381 B | 116 | 0.0328 s | 0.2766 s |

这些是单次 Windows CPU 运行数据，不是整页吞吐、GPU 基准或整书质量指标。源代码、探针、权重、字体和合成图像摘要及逐条预测保存在[机器可读证据](../evidence/ocr-mongology-offline-20260927.json)。生成图像和原始输出在忽略跟踪的 `output/ocr-qualification-20260927/`，未将字体文件或学术材料提交进仓库。

复现命令：

```powershell
& 'C:\Users\35326\Documents\Codex\mongology-academic-ocr\.venv_training\Scripts\python.exe' `
  'D:\Projects\AcademicCloud-vnext\scripts\ocr\probe-mongology-offline.py' `
  --engine-root 'C:\Users\35326\Documents\Codex\mongology-academic-ocr' `
  --output-dir 'D:\Projects\AcademicCloud-vnext\output\ocr-qualification-new-run' `
  --font 'C:\Windows\Fonts\times.ttf' --font 'C:\Windows\Fonts\arial.ttf'
```

输出目录必须不存在且位于原引擎目录之外。探针不调用训练接口，不访问生产，不自动安装/下载任何东西。

### 实际发现

- 158 字转写字表包含 `ö ü š č Č ǰ Γ γ`。116 字西文模型仅包含此次集合中的 `ö ü`，缺少其余六种字符，不能替代转写模型。
- 两个字表都缺少此次检查的传统蒙古文 `ᠮᠣᠩᠭᠣᠯ` 与西里尔文 `Монгол` 中的字符。这里是输出字表证据，不是针对这些文字做过图像识别或质量验收。
- 转写模型对 Arial 合成 `qaγan köke üge` 输出 `qaγan kÖke üge`，模型分数仍约 0.98。不能将分数直接解释为准确概率或人工核对状态。
- 西文模型在合成空白图上输出 `d`，分数约 0.12。需要独立页/区域状态与质量控制；非空输出不证明原页存在文字。
- 原模型的 gamma、引号与连字符规范化不可逆，仍须保留规则身份与待校标识；此次不改变原模型或原工程的规范化策略。

实测状态：`RUNTIME_SMOKE=PASS`；`EXTERNAL_DOCUMENT_QUALITY=NOT_RUN`；`WSL_CUDA=NOT_RUN`；`ACADEMICCLOUD_INTEGRATION=NOT_IMPLEMENTED`；`PRODUCTION_ACCEPTANCE=NOT_RUN`。

## 2. 为什么不能直接转发原 JSONL

原导出是行清单。`src/mongology_ocr/database_interface.py` 默认跳过未预测且未校对的行，零行页面也不会产生记录。因此结果必须另外包含“请求了哪些页、每页处理到了什么状态”；不能由缺行推断空白或完成。

`text_policy=ocr_only` 只改变显示文字的选择，导出仍包含 `text.verified`、`text.draft` 和本地路径。接入层须白名单投影机器结果，不能通过设置这个参数就认为排除了私人校勘内容。

下列字段名为设计草案，未加入现行 v11 书目合同：

| 输入 | 统一页结果的处理 |
|---|---|
| `document.source_sha256` | 与可信源摘要核对；不能替代 Core 的 `inputVersion` 源指纹 |
| 本地 document/page/line ID | 映射到 Core 的 `resourceId/sourceId/physicalPage` 与本成果内区域/行身份；不把文件名派生 ID 当全局正式身份 |
| `page.source_page_index` | 零起始源页序，显式转换为平台一基 `physicalPage`，必须属于当前任务页清单；核验外部一基页码一致性 |
| `page.width/height/dpi/image_sha256` | 验证同页一致；补原 PDF 尺寸、旋转、裁剪与像素坐标变换 |
| 区域/行 bbox、类型、顺序 | 验证有限数值、合法范围、父子归属、唯一性；缺失顺序标未知 |
| `text.ocr` 与 `ocr.text` | 一致才接纳为机器文本；缺预测与空预测分别表示 |
| confidence、script/direction hints | 有界诊断或提示；不赋予学术权威，不代表已验证支持 |
| model label | 另由可信发布清单绑定权重、字表、规范化规则、管线和配置的摘要 |
| `verified/draft/display/searchable_text` | 首版不导入；人工稿需要独立身份和来源确认流程 |
| `human_verified`、`gold` 等外部状态 | 不提升权限；机器成果始终是未校对文本 |
| 本地文件路径、导出路径和任意 warnings | 不透传到页面、存储键或日志；质量提示映射为受控代码 |

现有平台合同为 `academiccloud.reader-ocr.v1`，入口仍 disabled。扩展应复用其 `resourceId/sourceId`、一基物理页和显式页范围，通过新版本或明确兼容策略增加异步作业/页清单/区域结构；不要另建平行公开 OCR API。Compute 的作业封装另绑定 job/attempt/inputVersion、管线身份与结果摘要。服务端独立重查当前权限、租约、取消和源生命周期，产生最终接纳时间与版本。

页状态建议区分 `recognized / no_text / failed / unsupported`；`no_text` 表示本轮没有得到可用文字，不能直接宣称视觉空白。文档状态另有等待、运行、部分完成、完成、失败和取消等投影，不能用一个页面质量字段覆盖作业状态。

## 3. 接入原型应覆盖的验收案例

1. 多区域多行、物理页与印刷页码分离、旋转裁剪坐标正确回投。
2. 缺行页、空预测、整页失败、分割失败与不支持文字分别留痕。
3. 超长文字、过量区域/行、NaN/Infinity、反向框、越页/越区域框和冲突重复 ID 被拒绝。
4. OCR 两处文字不一致、同页尺寸/摘要冲突、错误页清单或源版本被拒绝。
5. 注入本地人工状态、私稿或路径不能影响共享结果或出现在日志。
6. 发布模型/字表/配置不匹配时拒绝；仅模型标签相同不够。
7. 重复提交保持幂等；过期 attempt、取消与撤权后回调失效；单页重试不覆盖旧版或人工修订。
8. 坐标变换、方向或置信度未知时明确缺失，不虚构精确位置或质量。

这些是后续原型的验收规格，不表示本轮已实现或通过这些平台级案例。现有 Core 书目回调保持原样。

## 4. 下一步的最小交付

优先建立合成夹具驱动的页清单与结果映射原型，再按新书人工金标评估转写模型及汉文路线。通过后才接正常产品界面和生产任务。

真实质量集按文档而不是随机行隔离训练、调试与验收；已有 epoch6 不能在从其训练池后切分出的子集上冒充盲测。蒙古学材料分别统计基础字符、变音符号和码位差异；汉文分别统计横排、竖排、多栏和夹注，不混算一个总分。

本次探针和运行证据经独立只读复核。新增探针和本记录只用于本地资格检查；vNext 录入实现、生产配置与原 OCR 工程未由本轮修改。
