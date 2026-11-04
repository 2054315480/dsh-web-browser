# DSH 浏览器视图插件（dsh-web-browser）

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的会话界面加一个「浏览器」标签页：紧挨着「对话」「轨迹」，在标签行下方的视图区域里直接浏览网页。

> 仓库：[GitHub](https://github.com/2054315480/dsh-web-browser) · [Gitee](https://gitee.com/qiuhee/dsh-web-browser)（镜像）

> 纯客户端插件，**无需构建**：`client.js` 由 DSH 的客户端模块加载器直接加载。

## 功能

- **「浏览器」标签**：注册 `conversation.view`，与「对话」「轨迹」并排；点击即切换，点「对话」标签或工具栏 ✕ 返回聊天
- **占满视图区**：浏览器激活时自动隐藏聊天输入框，整块区域显示网页；切回对话时自动恢复
- **真实网页引擎**：桌面端使用 Electron `<webview>`（与 DSH 官方侧栏浏览器相同的租约/分区机制），纯 Web 端回退沙箱 iframe
- **完整工具栏**：后退 / 前进 / 刷新 / 主页 / 地址栏（裸域名补 `https://`、纯文字转搜索、`localhost` 走 `http://`）/ 设为主页 / 在系统浏览器打开 / 关闭
- **自动登录（可选）**：打开 DeepSeek 时自动切换到密码登录、填写并提交；工具栏锁图标可配置账号密码
- **环境提示自动关闭**：对 DeepSeek 的「使用环境异常」弹层设置普通 Chrome UA 规避，并用 MutationObserver 兜底自动关闭
- **多标签页**：可同时打开多个标签，标签间切换保留各自地址；`+` 新建标签，标签上的 × 关闭
- **中英双语**、无障碍（所有按钮带 `aria-label` / `title`）、跟随主题令牌

## 安装

插件是标准的 DSH 客户端 bundle。以本地链接方式安装到某个 profile：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "@local/dsh-web-browser": "link:/path/to/dsh-browser-plugin"
  }
}
```

或在 profile 的 `cordis.patch.yml` 中注入 Loader 行：

```yaml
- insert:
    - id: web-browser
      name: '@local/dsh-web-browser'
```

安装后刷新页面（或重启应用）。

## 使用

1. 打开任意会话，点击会话头的「浏览器」标签
2. 工具栏右侧锁图标：**自动登录设置**（账号 / 密码，只保存在本机 LocalStorage）
3. 浏览器分区在同一工作区内共享，应用运行期间登录状态保持；重启应用后自动登录会重新执行

## 自动登录

首次使用时在锁图标面板填入账号密码并保存（凭据只保存在本机 LocalStorage）。之后打开浏览器会：

1. 等待登录页渲染
2. 若显示验证码登录，点击「密码登录」
3. 填写账号密码并提交
4. 若出现人机验证 / 短信验证，脚本会停在表单（账号密码已填好），手动完成即可

> **仓库不含任何凭据。** 请勿在 issue / PR 中粘贴账号密码。

## 安全说明

- 自动化脚本通过 `<webview>.executeJavaScript` 在页面自身上下文执行，凭据不会发送给第三方
- 账号密码以明文保存在应用 LocalStorage（键：`dsh-web-browser:login`）；如不需要，请关闭自动登录或留空
- webview 使用 DSH 桌面壳分配的隔离分区（cookie 与其他站点隔离）；应用重启后分区重置

## 兼容性

- **桌面端（Electron）**：需要 DSH 桌面壳提供 `globalThis.dshDesktop`（协议版本 1）
- **纯 Web 端**：自动回退到沙箱 iframe；部分站点（如 Google）禁止 iframe 嵌入，会显示提示并建议用系统浏览器打开

## 开发

无构建步骤：

| 文件 | 作用 |
| --- | --- |
| `client.js` | 唯一的客户端模块（`window.__ModuleLoader__.load` 包装），注册会话视图、工具栏、自动登录 |
| `index.js` | Host 端空实现（Loader 行需要） |
| `cordis.patch.yml` | 向 bundle 注入 Loader 行 |
| `locale/*.json` | 插件管理器中显示的名称与描述 |

调试：客户端诊断信息写入 LocalStorage 键 `dsh-web-browser:diag`（包含 guest 启动、租约、自动登录、弹层关闭等阶段）。

## English

A DeepSeek Harness client plugin adding a **Browser** conversation view next to Chat/Trajectory. It renders pages in an Electron `<webview>` guest on desktop (with iframe fallback on plain web), hides the chat composer while active, supports multiple tabs, and can auto-fill the DeepSeek password login (credentials stay in local LocalStorage — never in this repository).

## License

MIT
