# 贡献指南

感谢你愿意为 Dew 做出贡献！本文说明提交 Issue、开发与提交代码的约定。

## 提交 Issue

- 报告问题时，请写明系统版本、Dew 版本、复现步骤、预期结果与实际结果，必要时附上截图或示例文档。
- 提出新功能前，建议先搜索已有 Issue，避免重复。

## 开发流程

1. Fork 本仓库并基于 `main` 新建分支，例如 `feat/quick-open`、`fix/live-caret`。
2. 按 [README](README.md#开发) 安装依赖并启动开发环境。
3. 提交前确认以下检查全部通过：

   ```sh
   bun run typecheck
   bun test src
   go test ./...
   ```

4. 改动了用户可见的行为时，运行覆盖该功能的端到端测试分段（见 [AGENTS.md](AGENTS.md)）。行为是有意改变的，请在同一个提交中更新对应的测试。
5. 发起 Pull Request，说明改动内容与动机，并关联相关 Issue。

## 提交信息规范

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，描述使用中文：

```text
<类型>(<范围>): <描述>

[正文：说明改动原因与影响，可选]
```

| 类型 | 用途 | 是否进入更新日志 |
| --- | --- | --- |
| `feat` | 新功能 | 是（新功能） |
| `fix` | 问题修复 | 是（问题修复） |
| `perf` | 性能优化 | 是（性能优化） |
| `docs` | 文档 | 否 |
| `test` | 测试 | 否 |
| `refactor` | 不改变行为的重构 | 否 |
| `build` / `ci` | 构建与持续集成 | 否 |
| `chore` | 其他杂项 | 否 |

范围可选，表示改动的区域，如 `editor`、`live`、`preview`、`export`、`tabs`、`assist`。不兼容的改动在类型后加 `!`，或在正文中写 `BREAKING CHANGE:`。

示例：

```text
feat(tabs): 新增 ⌘P 快速打开
fix(live): 输入改变块类型时保留实时编辑器与光标
```

## 版本发布

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)，发布流程由 [release-please](https://github.com/googleapis/release-please) 自动完成：

1. `feat`、`fix`、`perf` 等提交合入 `main` 后，release-please 会创建或更新一个名为「chore: 发布 vX.Y.Z」的 Pull Request，其中包含版本号变更（`package.json` 与 `mygo.config.ts`）和自动生成的 `CHANGELOG.md` 条目。
2. 维护者审阅并合并该 PR 后，会自动创建 `vX.Y.Z` 标签与 GitHub Release，发布说明即为更新日志中的对应条目。
3. Release 工作流随即构建安装包，并上传到该 Release。

请不要手动修改版本号或 `CHANGELOG.md`。

## 许可证

提交贡献即表示你同意以 [MIT 许可证](LICENSE)发布你的代码。
