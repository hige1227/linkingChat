# Role: Python PPTX Generator (High-End Tech Style)

请基于 **docs/dev-plan**，编写一个高质量的 Python 脚本，使用 `python-pptx` 库生成两份 PPT。

---

### 1. 核心任务
生成两份风格统一但侧重点不同的演示文稿：

**PPT A：产品概览 (The Business Logic)**
- **文件名**：`Presentation_Overview.pptx`
- **受众**：投资人、业务决策者
- **核心**：痛点、解决方案、商业价值（无技术黑话）
- **页数**：9-12 页

**PPT B：产品视觉与架构 (The System Blueprints)**
- **文件名**：`Presentation_Visuals.pptx`
- **受众**：CTO、技术评审、设计团队
- **核心**：架构蓝图、数据流、功能矩阵、UI 概念
- **页数**：10-14 页

---

### 2. 设计规范 (Design System: "Hermès Tech")

请在 Python 脚本中定义一个 `DesignSystem` 类，严格执行以下审美标准：

#### A. 配色哲学 (Narrative Color Palette)
不要随机用色，颜色代表逻辑：
- **背景 (Void)**: `#0C1321` (极深藏青，RGB: 12, 19, 33)。**必须在 Slide Master 中锁定**。
- **光辉 (The Solution)**: `#F37021` (Hermès Orange)。**仅**用于核心价值、增长数据、最终方案。它是画面唯一的光源。
- **痛点 (The Pain)**: `#CC142E` (Rouge H)。**极度克制**，仅用于标记问题、风险或竞品劣势。
- **结构 (The Structure)**: `#4A5A75` (Titanium Grey)。用于坐标轴、次级边框、模块轮廓。替代纯白或纯蓝，增加工业精密感。
- **正文**: `#F0EDE8` (暖白)。
- **注释**: `#8A9AB5` (灰蓝)。

#### B. 视觉语言 (Industrial Blueprint & Broken Style)
致敬精密图纸与“断线”美学：
- **线型 (Stroke)**:
  - 默认为 **1pt** 细线。
  - **连接线/装饰线**：强制使用 **虚线 (Dash)** 或 **点线 (Dot)**，模仿马鞍针法或图纸辅助线。
  - 仅“主流程”路径使用实线。
- **容器 (Container)**:
  - **幽灵卡片**：无填充 或 5% 透明度的 `#111B2B` 填充。
  - **边框**：使用 `#4A5A75` (钛金灰) 的细实线。
  - **角标**：在卡片四角绘制 "L" 形断线标记（类似相机取景框），增加工业图纸感。
- **图标策略 (Geometric Stencil)**:
  - **不要**尝试绘制复杂矢量图标。
  - **使用几何抽象**：用 **虚线边框** 的圆形或正方形代表图标。
  - 例如：一个橙色虚线边框的圆形 = 用户；三个堆叠的钛金灰虚线矩形 = 数据库。
  - 这种“未闭合”的视觉风格呼应 "Broken Icon" 的设计感。

#### C. 排版规范 (Magazine Layout)
- **字体**：中文强制指定 `Microsoft YaHei` (微软雅黑)，英文 `Arial`。
- **对齐**：除封面外，标题与正文 **严格左对齐**。禁止居中。
- **编号**：使用“代码行号”风格（如 `01 /`, `02 /`），使用等宽字体感。
- **留白**：保持 40% 以上的负空间，宁可多一页，绝不拥挤。

---

### 3. 内容大纲 (Content Strategy)

**PPT A (Overview) 建议结构：**
1. **封面**: 极简，左下角大标题。
2. **Context**: 行业背景/现状（使用灰色调）。
3. **The Pain**: 用户面临的核心问题（使用 Rouge H 红色点缀）。
4. **The Concept**: 产品一句话定义（大号字体）。
5. **The Solution**: 核心功能 × 3（使用 Hermès Orange 强调）。
6. **User Value**: 效率/成本对比图。
7. **Roadmap**: 线性时间轴（使用虚线连接）。
8. **End**: Slogan。

**PPT B (Visuals) 建议结构：**
1. **封面**: 增加“Technical Review”字样。
2. **Architecture**: 分层架构图（卡片堆叠）。
3. **User Journey**: 用户操作流程（使用虚线箭头连接圆角矩形）。
4. **Data Flow**: 数据流向（Source -> Process -> Sink）。
5. **UI Concept**: 
   - **移动端框线图**：请绘制一个 9:16 的圆角矩形框（代表手机），内部放入简单的模块示意。
6. **Tech Stack**: 技术栈矩阵（表格形式，极细边框）。
7. **Security**: 安全合规说明（锁形几何抽象）。

---

### 4. 脚本技术要求
1. **Slide Master**: 必须通过代码修改母版背景色，确保新建页面自动应用深色背景。
2. **容错性**: 如果输入文档缺少某部分细节，请在 PPT 中生成文本 `[待补充: XXX数据]`，不要报错停止。
3. **调试**: 脚本运行结束后，**请保留 `gen_ppt.py` 文件**，不要自动删除，以便我微调布局代码。
4. **输出**: 最终输出两个 `.pptx` 文件。