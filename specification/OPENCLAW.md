# OpenClaw：注册并启用 Senses

把 **Agent Senses** 接到本机 OpenClaw 网关：安装插件、打开开关、放好 `senses/` 目录，然后重启 Gateway。

**前提：** Gateway 版本满足插件清单中的 `minGatewayVersion` / `pluginApi`（见 `openclaw-senses-plugin/openclaw.plugin.json`）。

## 1. 安装插件

在终端执行（将路径换成本机 `agentsenses` 仓库下的插件目录）：

```bash
openclaw plugins install /path/to/agentsenses/openclaw-senses-plugin
```

已安装过、需用当前目录覆盖时，可加 CLI 提供的 `--force`（以 `openclaw plugins install --help` 为准）。

## 2. 启用插件

编辑 **`~/.openclaw/openclaw.json`**，在 `plugins.entries` 中确保包含：

```json
"@local/openclaw-senses": {
  "enabled": true
}
```

## 3. 放置 sense 包

插件从 **`resolvePath("senses")`** 对应的目录读取**直接子目录**；每个子目录是一个 sense 包（内含 `SENSE.md` 或 `sense.yaml` + `prompt.md`）。

常见做法：使用工作区下的 **`~/.openclaw/workspace/senses/`**，例如：

```text
~/.openclaw/workspace/senses/
├── safety_sense/SENSE.md
├── citation_sense/SENSE.md
└── ...
```

可将本仓库示例同步到工作区（按需去掉 `--delete`）：

```bash
rsync -a /path/to/agentsenses/examples/senses/ ~/.openclaw/workspace/senses/
```

提交前可用参考库校验：

```bash
cd /path/to/agentsenses/senses-ref && uv run senses-ref validate-tree ../examples/senses
```

## 4. 重启 Gateway

```bash
openclaw gateway restart
```

（若你使用其他方式启动网关，请用等价操作重新加载配置。）

## 5. 自检

- 在 Gateway 日志中搜索 **`openclaw-senses`** 或 **`weave @`**，确认有织入记录。
- 需要更换插件源码目录时：对新路径重新执行 `openclaw plugins install`，或更新 `plugins.installs["@local/openclaw-senses"]` 中的 `sourcePath` 后重装并重启。

## 相关文档

- 格式与字段：[`SENSE_FORMAT.md`](./SENSE_FORMAT.md)
- 其他 Sense Client 接入思路：[`ADDING_SENSES_SUPPORT.md`](./ADDING_SENSES_SUPPORT.md)
