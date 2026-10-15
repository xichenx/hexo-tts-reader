# Publishing to npm / npm 发布

This repository publishes stable GitHub Releases with `NPM_TOKEN` first.
Confirmed token authentication failures fall back to npm Trusted Publishing (OIDC).

## 发布策略

- 保留 GitHub Actions Secret `NPM_TOKEN`，有效时始终使用它发布。
- Token 路径隐藏 OIDC 环境，避免 npm 自动优先选择 OIDC。
- `npm whoami` 或发布返回 `E401` / `ENEEDAUTH`（失效、过期或被撤销）时，才回退到 OIDC。
- 发布返回 `E404` 时重新检查身份；只有确认凭据失效才回退。
- 缺少 Secret、权限不足、2FA、版本冲突、网络错误直接失败，不自动换认证方式。
- OIDC 回退不会携带 `NPM_TOKEN`；需要 npm 端已有有效信任绑定。

## 配置 OIDC 备用通道

在仓库根目录运行（配置工具需要 Node.js 24、npm >=11.15）：

```sh
npm run release:setup -- --dry-run  # 查看目标，不登录、不修改配置
npm run release:setup             # 检查登录并调用 npm trust
```

工具使用 npm 官方登录和双重验证流程。请使用有该包写权限的维护者账号；
账号需要开启 2FA。它不会获取、复制或保存长期发布 Token，也不会替换已有的信任配置。
如果 npm 提示已有配置，先用 `npm trust list hexo-tts-reader` 核对。

也可以直接在 [npm 包设置](https://www.npmjs.com/package/hexo-tts-reader/access)
的 **Trusted publishing** 中选择 **GitHub Actions**，填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `xichenx` |
| Repository | `hexo-tts-reader` |
| Workflow filename | `npm-publish.yml`（只填文件名） |
| Environment name | 留空 |
| Allowed actions | 允许 `npm publish` |

新绑定需要在 **2 天内通过该绑定完成首次发布**，使用 Token 发布不算激活 OIDC。
因此不要提前创建一个长期闲置的备用绑定：应在需要 OIDC 发布时配置并及时使用。
未激活或已过期的绑定无法兜底，需重新配置。绑定激活后仍保留 `NPM_TOKEN`，维持 Token 优先策略。

## 发布与补发

常规发布：先提交一致的 `package.json` / `package-lock.json` 版本，再创建对应
`vX.Y.Z` 的正式 GitHub Release。工作流校验版本、安装依赖、测试后发布到 npm `latest`。
预发布版本不走这条正式发布流程。

补发已经存在的 Release（例如 `v0.2.0`）：

1. 打开 [Node.js Package workflow](https://github.com/xichenx/hexo-tts-reader/actions/workflows/npm-publish.yml)。
2. 点击 **Run workflow**，选择 **main**，`tag` 填写 `v0.2.0`。
3. 工作流使用 main 上的新发布配置，检出并测试该标签的代码，然后按 Token 优先、认证失效才回退的策略发布。

不要重新运行迁移前失败的旧任务：它仍使用旧版 Token 配置。
不需要移动标签或重新创建 Release。npm 已存在的版本无法覆盖。

## English quick reference

Keep the repository `NPM_TOKEN` secret. To configure the OIDC fallback, run
`npm run release:setup` with Node.js 24 and npm >=11.15. Complete npm
login and 2FA as a package maintainer. Alternatively, enter the settings in the
table above on npm. Enable direct publishing (`npm publish`) and leave the
GitHub environment blank.

Publish a stable GitHub Release for normal releases. To retry an existing tag
with the migrated workflow, dispatch **Node.js Package** from **main** and set
`tag` to the existing release tag. Tests and version checks run against that
tag before publishing. Do not rerun the old token-based job.

References: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/),
[`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
