# API Guide / API 调用指南

This page explains how to create and configure usable APIs for Paper Reader Plus. The app does not include any third-party secret keys. You need to create keys in the provider console, then enter them in the API panels under `Settings`.

本文说明如何为 Paper Reader Plus 创建并配置可用的 API。应用不会内置任何第三方密钥；你需要在对应服务商控制台创建密钥，然后填入 `Settings` 中的 API 面板。

## AI Reading API / AI 阅读 API

AI reading, selection Q&A, AI translation, summary generation, and metaphor explanations use an OpenAI-compatible Chat Completions API.

AI 阅读、选区提问、AI 翻译、摘要生成和隐喻解释使用 OpenAI-compatible Chat Completions 接口。

### 1. Create An API Key / 创建 API Key

1. Open the console for your chosen model provider.
2. Create or enter a project, workspace, or application.
3. Enable a model service that supports Chat Completions.
4. Create an API Key and copy the secret.
5. Record the provider's Base URL and model name.

1. 打开你选择的模型服务商控制台。
2. 创建或进入一个项目、空间或应用。
3. 开通支持 Chat Completions 的模型服务。
4. 新建 API Key，并复制密钥。
5. 记录该服务商的 Base URL 和模型名。

Do not write API keys into papers, notes, screenshots, or public repositories. Only enter them in the local settings page.

不要把 API Key 写入论文、笔记、截图或公开仓库。只在本机设置页中填写。

### 2. Configure In The App / 在应用中配置

Open `Settings > Agent API` and fill in:

打开 `Settings > Agent API`，填写：

| Field / 字段 | Value / 填写内容 |
| --- | --- |
| Provider | Current preset is `Volcengine Ark`. / 当前界面预设为 `Volcengine Ark`。 |
| Base URL | The provider's OpenAI-compatible base URL, for example `https://ark.cn-beijing.volces.com/api/v3`. / 服务商的 OpenAI-compatible 基础地址，例如 `https://ark.cn-beijing.volces.com/api/v3`。 |
| Model | The model ID, endpoint, or model name shown in the provider console. / 模型 ID，例如服务商控制台显示的 endpoint 或模型名。 |
| API Key | Your secret key. / 你的密钥。 |
| API Type | Select `Chat completions`. / 选择 `Chat completions`。 |

The actual request URL used by the app is:

应用实际请求地址为：

```text
{Base URL}/chat/completions
```

Requests use a Bearer token:

请求会使用 Bearer Token：

```http
Authorization: Bearer <your API key>
Content-Type: application/json
```

### 3. Check The Request Shape / 自检请求格式

If you want to verify whether a provider is compatible, send a minimal request to the same endpoint:

如果你要验证服务商是否兼容，可以用同样的地址发送一个最小请求：

```bash
curl -X POST "https://example.com/api/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_MODEL",
    "messages": [
      { "role": "user", "content": "Hello" }
    ],
    "temperature": 0.2
  }'
```

Replace the URL, key, and model name with your provider's information. A service that returns `choices[0].message.content` can usually be used for AI reading.

把示例中的 URL、Key 和模型名替换为你的服务商信息。能返回 `choices[0].message.content` 的服务通常可以用于 AI 阅读。

## Translation API / 翻译 API

Translation has two modes:

翻译有两种模式：

| Mode / 模式 | Description / 说明 |
| --- | --- |
| `Use AI chat API` | Reuse `Settings > Agent API`; translation is handled by the large language model. / 复用 `Settings > Agent API`，由大模型完成翻译。 |
| `Use translation API` | Use an independent translation service. Google Cloud Translation and Baidu General Translation are currently supported. / 使用独立翻译服务，当前支持 Google Cloud Translation 和百度通用翻译。 |

### Google Cloud Translation / Google Cloud Translation

In the Google Cloud console:

在 Google Cloud 控制台中：

1. Create or select a project.
2. Enable Cloud Translation API.
3. Create an API Key.
4. Record the Project ID and API Key.

1. 创建或选择一个 Project。
2. 启用 Cloud Translation API。
3. 创建 API Key。
4. 记录 Project ID 和 API Key。

In `Settings > Translation API`:

在 `Settings > Translation API` 中：

| Field / 字段 | Value / 填写内容 |
| --- | --- |
| Translation Mode | `Use translation API` |
| Translation Provider | `Google` |
| Google Project ID | Google Cloud Project ID |
| Google API Key | Google API Key |
| Target Language | Target language, for example `Chinese`, `English`, `zh-CN`, or `en`. / 目标语言，例如 `Chinese`、`English`、`zh-CN`、`en`。 |

The app calls Google Translation v3 `translateText`. If your network requires a proxy, enable it in `Settings > General`; that proxy is used for Google translation requests.

应用调用的是 Google Translation v3 `translateText` 接口。若你的网络需要代理，可在 `Settings > General` 中启用网络代理；该代理会用于 Google 翻译请求。

### Baidu General Translation / 百度通用翻译

In the Baidu Translation Open Platform:

在百度翻译开放平台中：

1. Create a General Translation service application.
2. Get the App ID.
3. Get the App Key.

1. 创建通用翻译服务应用。
2. 获取 App ID。
3. 获取 App Key。

In `Settings > Translation API`:

在 `Settings > Translation API` 中：

| Field / 字段 | Value / 填写内容 |
| --- | --- |
| Translation Mode | `Use translation API` |
| Translation Provider | `Baidu` |
| Baidu App ID | Baidu Translation App ID. / 百度翻译 App ID。 |
| Baidu App Key | Baidu Translation App Key. / 百度翻译 App Key。 |
| Target Language | Target language, for example `Chinese`, `English`, `zh`, or `en`. / 目标语言，例如 `Chinese`、`English`、`zh`、`en`。 |

Baidu translation requests use `appid + q + salt + appKey` to generate an MD5 signature. The app handles the signature automatically.

百度翻译请求使用 `appid + q + salt + appKey` 生成 MD5 签名，应用会自动完成签名。

## Formula OCR API / 公式 OCR API

Formula image recognition uses SimpleTex LaTeX OCR Turbo.

公式截图识别使用 SimpleTex LaTeX OCR Turbo。

### 1. Create A Token / 创建 Token

1. Open the SimpleTex console.
2. Enable the LaTeX OCR service or quota.
3. Create or copy the UAT Token.

1. 打开 SimpleTex 控制台。
2. 开通 LaTeX OCR 相关服务或额度。
3. 创建或复制 UAT Token。

### 2. Configure In The App / 在应用中配置

Open `Settings > OCR API`:

打开 `Settings > OCR API`：

| Field / 字段 | Value / 填写内容 |
| --- | --- |
| Enable SimpleTex OCR | Enable it. / 开启。 |
| SimpleTex OCR Token | Your UAT Token. / 你的 UAT Token。 |

The app uploads the selected formula image to the SimpleTex OCR API as `multipart/form-data`, then reads the returned LaTeX.

应用会把选中的公式图片作为 `multipart/form-data` 上传到 SimpleTex OCR 接口，并读取返回的 LaTeX。

## Testing And Troubleshooting / 测试与排错

After configuration, first use the test buttons in settings:

配置完成后，优先使用设置页里的测试按钮：

- `Settings > Agent API`: test the AI reading API. / 测试 AI 阅读接口。
- `Settings > Translation API`: test the translation API. / 测试翻译接口。
- `Settings > OCR API`: test SimpleTex OCR. / 测试 SimpleTex OCR。

Common issues:

常见问题：

| Symptom / 现象 | Check / 检查项 |
| --- | --- |
| 401 or `authorization failed` | API Key, Token, provider permissions, balance, or quota. / API Key、Token、服务商权限、余额或配额。 |
| 404 or `endpoint not found` | Check whether the Base URL has an extra or missing path segment; the app automatically appends `/chat/completions`. / Base URL 是否多写或少写路径；应用会自动追加 `/chat/completions`。 |
| `model not found` | Check whether the model ID matches the provider console. / 模型 ID 是否和服务商控制台一致。 |
| Empty translation | Check target language code, whether the service is enabled, and account quota. / 目标语言代码、服务是否已启用、账号额度。 |
| Google translation connection failed | Check whether network proxy is needed and whether the proxy address looks like `http://127.0.0.1:7890`. / 网络代理是否需要开启，代理地址是否形如 `http://127.0.0.1:7890`。 |

## Security Recommendations / 安全建议

- Do not commit real API keys to Git. / 不要提交真实 API Key 到 Git。
- Do not write secrets into `.readerp`, `.readerm`, Markdown notes, or screenshots. / 不要把密钥写入 `.readerp`、`.readerm`、Markdown 笔记或截图。
- If you suspect a secret has leaked, delete or rotate it immediately in the provider console. / 如果怀疑密钥泄露，立即到服务商控制台删除或轮换密钥。
- If you need local defaults during development, copy `docs/key.example.json` to `docs/key.local.json` and fill in your own credentials. `key.local.json` is ignored and should not be distributed with release packages. / 开发时如需本地默认值，可复制 `docs/key.example.json` 为 `docs/key.local.json` 并填写自己的凭据；`key.local.json` 已被忽略，不应随发布包分发。
