# GX 小游戏 Android 外壳

这是一个只加载 `https://game.gxgxg.com/` 的轻量原生 WebView 外壳。游戏内容继续由网站发布，普通网页更新不需要重新构建 APK。

## 原生行为

- 合集首页与文字地牢锁定竖屏。
- 大鱼吃小鱼锁定横屏并进入沉浸式全屏，不受系统“竖屏锁定”习惯影响。
- 合集与文字地牢根据状态栏、挖孔和底部手势区域动态留出安全边距；大鱼保持完整全屏画布。
- 站内链接留在 App 中，站外 HTTP/HTTPS 链接交给系统浏览器。
- Android 返回键优先返回上一个网页或合集首页。
- 禁止明文 HTTP、文件访问和 JavaScript 原生桥；TLS 出错时不会绕过证书校验。
- WebView 本地数据随 App 保留并参与 Android 系统备份；缓存目录不备份。

## 构建与发布

`.github/workflows/android-release.yml` 在 GitHub Actions 上构建签名 APK。手动运行工作流并填写版本号后，会：

1. 运行两个游戏的 Node 测试。
2. 安装 Java、Gradle 与 Android SDK。
3. 从 GitHub Actions Secrets 恢复签名密钥。
4. 构建并验证 release APK。
5. 上传 Actions Artifact，并创建 `android-v<版本号>` GitHub Release。
6. 发布稳定文件名 `GX-Arcade.apk` 与 `GX-Arcade.apk.sha256`。

网页下载按钮固定指向：

`https://github.com/gxmst/gxWebgame/releases/latest/download/GX-Arcade.apk`

所需 Secrets：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。签名密钥必须永久保留；更换密钥后无法覆盖升级已安装的 App。
