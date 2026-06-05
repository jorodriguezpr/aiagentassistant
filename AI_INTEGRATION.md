# AI Provider Configuration Guide

Complete guide to configuring AI providers in AI Agent Assistant.  
Configure via `/opt/aiagentassistant/app/.env` or the **Admin Portal → Settings**.

---

## Supported Providers

| Provider | `AI_PROVIDER` | Key env var | Cost | Notes |
|----------|--------------|-------------|------|-------|
| **Anthropic Claude** ★ | `anthropic` | `ANTHROPIC_API_KEY` | Paid | Best reasoning, recommended for IT tasks |
| **OpenAI** | `openai` | `OPENAI_API_KEY` | Paid | GPT-4 Turbo, GPT-4o |
| **GitHub Copilot** | `github-copilot` | `GITHUB_COPILOT_API_KEY` | Free with Copilot subscription | Uses OpenAI models via GitHub |
| **Ollama Cloud** | `ollama-cloud` | `OLLAMA_CLOUD_API_KEY` | Free tier available | Hosted at ollama.com |
| **Ollama (local)** | `ollama` | — | Free | Needs Ollama running on the server |
| **Lemonade** | `lemonade` | — | Free | OpenAI-compatible local server |

---

## Anthropic Claude (Recommended)

Best overall quality for IT administration, reasoning, and long agentic tasks.

### Setup

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add to `.env`:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_API_KEY=sk-ant-api03-...
AI_MODEL=claude-opus-4-7
```

### Available models (2026)

| Model | Speed | Cost | Best for |
|-------|-------|------|----------|
| `claude-opus-4-7` | Slower | Higher | Complex reasoning, long tasks ★ Default |
| `claude-opus-4-8` | Slower | Higher | Latest and most capable |
| `claude-sonnet-4-6` | Fast | Medium | Daily use, speed/quality balance |
| `claude-haiku-4-5` | Fastest | Low | Quick queries, high volume |

---

## OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
AI_API_KEY=sk-...
AI_MODEL=gpt-4-turbo
```

### Available models

| Model | Notes |
|-------|-------|
| `gpt-4o` | Latest GPT-4 Omni |
| `gpt-4-turbo` | Fast GPT-4, 128k context |
| `gpt-4` | Original GPT-4 |
| `gpt-3.5-turbo` | Fast, economical |

---

## GitHub Copilot

Uses OpenAI's GPT-4o models via GitHub's infrastructure. Free with an active GitHub Copilot subscription.

```env
AI_PROVIDER=github-copilot
GITHUB_COPILOT_API_KEY=github_pat_...
AI_MODEL=gpt-4o
```

### Get a token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Generate a Personal Access Token (classic) with **Copilot** access
3. Or use a Fine-grained token with Models scope

### Available models

| Model | Notes |
|-------|-------|
| `gpt-4o` | Default ★ |
| `gpt-4-turbo` | |
| `gpt-4` | |
| `gpt-3.5-turbo` | |

---

## Ollama Cloud

Hosted Ollama service at [ollama.com](https://ollama.com). Free tier available with many open-source models.

```env
AI_PROVIDER=ollama-cloud
OLLAMA_CLOUD_API_KEY=your_key_here
AI_API_KEY=your_key_here
AI_MODEL=llama3.3
# Optional — default is https://ollama.com
# OLLAMA_CLOUD_BASE_URL=https://ollama.com
```

### Available models

| Model | Description |
|-------|-------------|
| `llama3.3` | Meta Llama 3.3 (recommended for general use) |
| `llama3.1` | Meta Llama 3.1 |
| `gemma3` | Google Gemma 3 |
| `phi4` | Microsoft Phi-4 |
| `mistral` | Mistral 7B |
| `deepseek-r1` | DeepSeek R1 reasoning model |
| `qwen2.5` | Alibaba Qwen 2.5 |
| `nemotron-3-super` | NVIDIA Nemotron |

> **Note:** Ollama Cloud uses the same wire format as local Ollama — Bearer auth with `/v1/chat/completions`. Tool calls work natively.

---

## Ollama (Local)

Run any open-source model on the same server or a nearby machine.

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
AI_MODEL=qwen2.5-coder:latest
```

### Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3:latest
ollama pull qwen2.5-coder:latest
```

### Using Ollama on a different host

```env
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

> **Note:** Local Ollama also uses `/v1/chat/completions` with Bearer auth (empty key). The system handles this automatically.

---

## Lemonade (Local)

An OpenAI-compatible local inference server. Good for Windows/WSL local models.

```env
AI_PROVIDER=lemonade
LEMONADE_BASE_URL=http://localhost:8000
AI_MODEL=Qwen2.5-0.5B-Instruct-CPU
```

> **Note:** Lemonade models typically have small context windows (2048–4096 tokens). The system automatically trims message history to fit. For complex tasks, use a cloud provider instead.

---

## Switching Providers at Runtime

### Via Telegram

```
/aimodel claude-sonnet-4-6
```

This changes the model for the current session. To make it permanent, update `.env` and restart.

### Via Admin Portal

1. Open `http://YOUR_SERVER:8085`
2. Go to **Settings**
3. Find `AI_PROVIDER` and `AI_MODEL`
4. Edit and save — the portal will prompt to restart the service

### Via command line

```bash
# Edit .env
sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER=anthropic/' /opt/aiagentassistant/app/.env
sed -i 's/^AI_MODEL=.*/AI_MODEL=claude-sonnet-4-6/' /opt/aiagentassistant/app/.env

# Restart
systemctl restart aiagentassistant
```

---

## Model Selection Tips

| Task type | Recommended model |
|-----------|------------------|
| Complex server administration | `claude-opus-4-7` or `claude-opus-4-8` |
| Daily conversation / quick tasks | `claude-sonnet-4-6` or `gpt-4o` |
| High-volume / cost-sensitive | `claude-haiku-4-5` or `gpt-3.5-turbo` |
| Fully free / open-source | `ollama-cloud` with `llama3.3` |
| Offline / air-gapped | `ollama` (local) with any pulled model |
| Code-focused tasks | `qwen2.5-coder:latest` (Ollama) |

---

## AI Configuration Variables

All variables in `/opt/aiagentassistant/app/.env`:

```env
# Provider selection
AI_PROVIDER=anthropic

# Model (provider-specific)
AI_MODEL=claude-opus-4-7

# Shared API key (set to whichever provider's key you're using)
AI_API_KEY=your_key_here

# Provider-specific keys (set the one for your chosen provider)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GITHUB_COPILOT_API_KEY=github_pat_...
OLLAMA_CLOUD_API_KEY=...

# Provider base URLs (only needed for local/custom endpoints)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CLOUD_BASE_URL=https://ollama.com
LEMONADE_BASE_URL=http://localhost:8000

# Generation parameters
AI_MAX_TOKENS=2000        # Maximum tokens in AI response
AI_TEMPERATURE=0.7        # 0.0 = deterministic, 1.0 = creative
```

---

## Troubleshooting

### "Model not found" / "Invalid model"

The model name doesn't match what the provider accepts. Check the available models table for your provider.

```bash
# Check what's currently set
grep AI_MODEL /opt/aiagentassistant/app/.env
```

### "Authentication failed" / "Invalid API key"

```bash
# Verify the key is set correctly
grep -E 'API_KEY|AI_PROVIDER' /opt/aiagentassistant/app/.env
```

Also check there are no trailing spaces or newlines in the key value.

### AI gives short/truncated responses

Increase `AI_MAX_TOKENS`:

```env
AI_MAX_TOKENS=4000
```

### AI loops forever / stops mid-task

The model may have insufficient context. Try:
1. A more capable model (`claude-opus-4-7` instead of `haiku`)
2. `/clear` in Telegram to reset conversation history
3. Break the task into smaller parts

### Ollama Cloud tool calls not working

Ensure `AI_PROVIDER=ollama-cloud` (not `ollama`). The cloud variant uses a different auth path. The system handles tool calling format automatically for each provider.

### Rate limit errors

Switch to a model tier with higher limits, or add a delay between requests. Anthropic and OpenAI both offer tier upgrades in their dashboards.
