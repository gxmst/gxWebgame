# 大鱼吃小鱼

手机横屏优先、电脑完整兼容的成长型 Canvas 2D 网页游戏。玩家从鱼苗开始，在珊瑚浅海中追逐猎物、躲避天敌；威胁比例会随档位提高，到达 T6 后封神并接取阶段合同。合同完成后可以主动返航结算，也可以继续巡游、承接更高目标并冲击高分。

项目采用原生 HTML、CSS 与 JavaScript ES Modules，无构建步骤、无运行时依赖，也不发送游戏数据到服务器。远景使用本地海洋 JPG 氛围图，像素鱼、动态光照、气泡和前景植被仍由 Canvas 程序绘制。世界是可上下左右穿越的环形海域，并按连续深度分成珊瑚浅海、开阔洋流和深海暗区；猎物、危险物、稀有鱼与得分倍率会随海域变化。T2、T4、T6 各触发一次固定种子的三选一构筑，九种能力只在本局生效，不影响成长商店。

设置页会在本设备保留最近 50 局试玩数据，并可导出 JSON。记录包含 seed、档位时间、结束原因、猎食与断粮、封神合同、渔网捕获和补鱼、帧率与画质、海域停留及构筑选择；该记录使用独立本地存储，不上传，也不混入永久进度存档。

## 本地运行

ES Modules 需要通过 HTTP 服务加载。在项目根目录执行：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。不要直接双击 `index.html`，浏览器对 `file://` 下的模块加载限制可能导致游戏无法启动。本地地址不会注册 Service Worker，避免开发时旧缓存遮住刚修改的文件。

## 测试

纯逻辑测试既可访问 `http://localhost:8000/tests.html`，也可直接在项目根目录运行：

```powershell
node tests/run-node.mjs
```

测试覆盖吞食阈值、成长与连击、相机换算与环形接缝、存档迁移、榜单排序、固定种子生成、动态难度、三次局内构筑、三类海域混合、T6 合同与返航、本地试玩记录、霸主威胁递增、饵鱼群约束、外观购买与加成、鱼种生态、昼夜状态、环境物交互、贝壳结算、粒子降级、自动画质调节和金币升级规则。

## 部署与 PWA

推送到 `main` 后，[`.github/workflows/ci-pages.yml`](./.github/workflows/ci-pages.yml) 会先执行 Node 逻辑测试，通过后自动启用 Pages，并将仓库作为零构建静态站部署。若仓库策略不允许 Actions 自动启用 Pages，再在 **Settings > Pages > Build and deployment** 中将 Source 设为 **GitHub Actions**。

线上 HTTPS 环境由 `js/bootstrap.js` 注册模块化 Service Worker。本次访问成功缓存后，导航会优先尝试网络并可回退到离线首页；脚本、样式和图片使用 stale-while-revalidate，在启动速度与后台更新之间取平衡。`localhost`、`127.0.0.1` 和本机 IPv6 地址不会注册，调试时无需手动清缓存。

应用版本、缓存名称和离线预缓存文件统一维护在 [`js/version.js`](./js/version.js)。发布会改变缓存内容时应递增 `APP_VERSION`，并同步检查 `PRECACHE_URLS` 是否包含新增的启动依赖；Service Worker 激活后会删除本项目的旧版本缓存。Manifest 提供 `192×192` 与 `512×512` 方形图标、横屏方向和 standalone 显示模式。

## 操作

| 平台 | 移动 | 冲刺 | 暂停 |
|---|---|---|---|
| 手机 / 平板 | 在画面左侧相对拖动 | 按住右下冲刺按钮 | 右上暂停按钮 |
| 电脑 | 鼠标指向或方向键 | 空格或鼠标右键 | `Esc` 或 `P` |

手机默认使用相对拖动，设置中可改为指向游动。竖屏时游戏自动暂停，并提示转为横屏。

每局结束会按得分结算金币，并将有意义的成绩写入本设备 Top 10。标题页的“成长商店”可升级游动速度、冲刺体力和吞噬范围，每项最多 5 级；“外观商店”可用珍珠独立购买并组合 8 套皮肤与 4 件配件。配件只有 2%~3% 的微弱加成，统一叠加在成长升级效果中。局内构筑会在本局额外叠加，返航或死亡后清空。

## 项目结构

```text
gxWebgame/
├─ assets/             # 本地海洋背景等静态视觉资源
├─ index.html          # Canvas、全部界面状态与无障碍语义
├─ manifest.webmanifest # PWA 名称、主题色、方向与图标
├─ styles.css          # 像素海洋视觉、横屏适配与触控热区
├─ js/                 # 游戏逻辑（原生 ES Modules）
├─ sw.js               # 离线缓存与更新策略
├─ tests/              # 纯逻辑浏览器测试
├─ tests.html          # 无依赖测试入口
├─ README.md
└─ 设计稿.md           # 完整玩法与技术基线
```

页面入口为 `./js/bootstrap.js`；它加载 `game.js`，并仅在线上环境注册 Service Worker。

如需对比纯程序化背景，可将 `js/config.js` 中的 `CONFIG.world.useBackgroundImage` 改为 `false`；图片加载失败时也会自动使用程序渐变背景。

## 界面绑定约定

脚本通过固定 ID 绑定界面。当前屏幕建议统一使用元素的 `hidden` 属性切换；HUD 内的临时元素使用 `.is-hidden`；Toast 同时支持添加 `.is-visible` 或设置 `aria-hidden="false"`。

- 主场景：`game-canvas`、`title-screen`、`shop-screen`、`hud`、`build-draft-screen`、`pause-screen`、`settings-screen`、`results-screen`
- 游戏 HUD：`score-value`、`combo-wrap`、`combo-value`、`biome-name`、`tier-name`、`tier-progress`、`sovereign-wrap`、`sovereign-goal-detail`、`stamina-fill`
- 操作按钮：`start-button`、`shop-button`、`settings-button`、`pause-button`、`dash-button`、`extract-button`、`resume-button`、`retry-button`
- 设置项：`volume-input`、`mute-toggle`、`music-toggle`、`vibration-toggle`、`shake-toggle`、`touch-mode`、`quality-select`、`contrast-toggle`、`export-telemetry-button`
- 反馈层：`rotate-overlay`、`tier-toast`、`message-toast`、`debug-panel`

更新进度条时，同步维护父级 `role="progressbar"` 的 `aria-valuenow`。更新 Toast 文案后再显示，以确保读屏软件播报新内容。`debug-panel` 内的 `[data-debug-output]` 用于写入多行实时指标。

## 调试

使用 `?debug=1` 启用调试覆盖层。调试信息包括 FPS、玩家质量与档位、体力、当前海域、生态生成权重、局内构筑、合同、饵鱼群、环境物、相机位置和随机种子。`]` / `[` 调整档位，`I` 切换无敌，`C` 补齐当前合同；这些快捷键只在调试模式生效。

玩法规则、数值基线、性能预算和阶段验收标准见 [设计稿.md](./设计稿.md)。
