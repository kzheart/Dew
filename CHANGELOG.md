# 更新日志

本项目的所有重要变更都记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。自 0.1.0 之后的条目由 [release-please](https://github.com/googleapis/release-please) 根据提交信息自动生成。

## [0.2.0](https://github.com/kzheart/Dew/compare/v0.1.0...v0.2.0) (2026-11-05)


### 新功能

* **tabs:** 设置面板在同组标签页间同步，后台标签页直接呈现结果 ([aebb7e2](https://github.com/kzheart/Dew/commit/aebb7e2effbc5d336e9209632f018e41390b3802))


### 问题修复

* **tabs:** 跨窗口共享的状态统一由 Go 推送，页面先订阅再读取 ([7a403c7](https://github.com/kzheart/Dew/commit/7a403c75af90ac63bfc5338e1e535eb6ecd694b4))
* **view:** 源码模式跟随阅读背景，切换模式不再丢失阅读位置 ([7f2b897](https://github.com/kzheart/Dew/commit/7f2b897575fe31d706b3db7a9099d016a91f9c07))


### 性能优化

* **view:** 切换视图与长文档不再卡顿 ([20000f6](https://github.com/kzheart/Dew/commit/20000f60d8375868e62415c1e4238aa76c036215))

## 0.1.0 (2026-11-03)

首个公开版本。

### 新功能

* 实时编辑、预览、源码与并排对照四种编辑模式
* 代码块支持语法高亮、指定行高亮、diff 显示与长代码折叠
* 支持 Mermaid、Vega-Lite、PlantUML 图表与 LaTeX 数学公式
* 空行输入 `/` 快速插入内容，选中文字后输入符号自动包裹
* 智能粘贴网页内容、表格数据与截图
* 表格自动对齐，可直接插入、移动和调整列
* 导出 PDF、HTML 或拷贝为富文本，打印时内容不被截断
* 将选中内容生成分享卡片
* 多文件同窗口切换与总览，找回最近关闭的文件并回到上次阅读位置
* 快速打开文件
* 设置面板与欢迎页

### 性能优化

* 提升长文档与公式密集文档的输入流畅度，加快启动速度
* 在高刷新率屏幕上以更高帧率显示
