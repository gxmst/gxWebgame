# 大鱼吃小鱼

手机横屏优先、电脑完整兼容的短局成长型 Canvas 2D 网页游戏。玩家从鱼苗开始，在珊瑚浅海中追逐猎物、躲避天敌，成长到 T6 后完成 30 秒霸主考验。

项目采用原生 HTML、CSS 与 JavaScript ES Modules，无构建步骤、无运行时依赖，也不发送网络请求。远景使用本地海洋 JPG 氛围图，像素鱼、动态光照、气泡和前景植被仍由 Canvas 程序绘制。游玩过程中会从镜头外进入成群沙丁鱼，适合冲刺横扫并快速叠加连击；玩家尾迹、缓慢洋流和分层吞食反馈会随省电画质自动降级。

## 本地运行

ES Modules 需要通过 HTTP 服务加载。在项目根目录执行：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。不要直接双击 `index.html`，浏览器对 `file://` 下的模块加载限制可能导致游戏无法启动。

## 测试

纯逻辑测试既可访问 `http://localhost:8000/tests.html`，也可直接在项目根目录运行：

```powershell
node tests/run-node.mjs
```

测试覆盖吞食阈值、成长与连击、相机换算、存档迁移、胜利/无尽结算、固定种子生成、饵鱼群约束、粒子降级、自动画质调节和金币升级规则。

## 操作

| 平台 | 移动 | 冲刺 | 暂停 |
|---|---|---|---|
| 手机 / 平板 | 在画面左侧相对拖动 | 按住右下冲刺按钮 | 右上暂停按钮 |
| 电脑 | 鼠标指向或方向键 | 空格或鼠标右键 | `Esc` 或 `P` |

手机默认使用相对拖动，设置中可改为指向游动。竖屏时游戏自动暂停，并提示转为横屏。

每局结束会按得分结算金币。标题页的“成长商店”可升级游动速度、冲刺体力和吞噬范围，每项最多 5 级；珍珠仍用于解锁皮肤。

## 项目结构

```text
gxWebgame/
├─ assets/             # 本地海洋背景等静态视觉资源
├─ index.html          # Canvas、全部界面状态与无障碍语义
├─ styles.css          # 像素海洋视觉、横屏适配与触控热区
├─ js/                 # 游戏逻辑（原生 ES Modules）
├─ tests/              # 纯逻辑浏览器测试
├─ tests.html          # 无依赖测试入口
├─ README.md
└─ 设计稿.md           # 完整玩法与技术基线
```

入口模块固定为 `./js/game.js`。

如需对比纯程序化背景，可将 `js/config.js` 中的 `CONFIG.world.useBackgroundImage` 改为 `false`；图片加载失败时也会自动使用程序渐变背景。

## 界面绑定约定

脚本通过固定 ID 绑定界面。当前屏幕建议统一使用元素的 `hidden` 属性切换；HUD 内的临时元素使用 `.is-hidden`；Toast 同时支持添加 `.is-visible` 或设置 `aria-hidden="false"`。

- 主场景：`game-canvas`、`title-screen`、`hud`、`pause-screen`、`settings-screen`、`results-screen`、`victory-screen`
- 游戏 HUD：`score-value`、`combo-wrap`、`combo-value`、`tier-name`、`tier-progress`、`apex-wrap`、`apex-time`、`stamina-fill`
- 操作按钮：`start-button`、`skin-button`、`settings-button`、`pause-button`、`dash-button`、`resume-button`、`retry-button`、`endless-button`
- 设置项：`volume-input`、`mute-toggle`、`vibration-toggle`、`shake-toggle`、`touch-mode`、`quality-select`、`contrast-toggle`
- 反馈层：`rotate-overlay`、`tier-toast`、`message-toast`、`debug-panel`

更新进度条时，同步维护父级 `role="progressbar"` 的 `aria-valuenow`。更新 Toast 文案后再显示，以确保读屏软件播报新内容。`debug-panel` 内的 `[data-debug-output]` 用于写入多行实时指标。

## 调试

使用 `?debug=1` 启用调试覆盖层。调试信息应至少包括 FPS、固定步更新次数、玩家质量与档位、体力、实体关系比例、AI 状态、相机边界和随机种子。调试状态仅保留在本机，不上传试玩数据。

玩法规则、数值基线、性能预算和阶段验收标准见 [设计稿.md](./设计稿.md)。
