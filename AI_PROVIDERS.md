# AI Provider Configuration Reference

AiAgentAssistant supports 7 AI providers. Switch between them by setting `AI_PROVIDER` in your `.env` file.

---

## Common Settings (all providers)

These settings apply regardless of which provider is active.

```env
# Which provider to use
AI_PROVIDER=anthropic

# Model override (each provider has a default; set this to change it)
AI_MODEL=claude-opus-4-7

# Generation parameters
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

---

## 1. Anthropic Claude ⭐ Recommended

The default and most capable provider for agentic tasks, IT automation, and complex reasoning.

```env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...               # Your Anthropic API key
# OR
ANTHROPIC_API_KEY=sk-ant-...        # Alternative key name (both are checked)

AI_MODEL=claude-opus-4-7            # Default
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

**Available models:**

| Model | Best For | Speed | Cost |
|---|---|---|---|
| `claude-opus-4-7` | Complex reasoning, agents, IT tasks | Slower | Highest |
| `claude-sonnet-4-6` | Balanced speed/intelligence | Medium | Medium |
| `claude-haiku-4-5` | Fast responses, cost-sensitive | Fastest | Lowest |
| `claude-opus-4-6` | Previous generation | Medium | Medium |

**Notes:**
- Native tool/function calling support
- Full multi-turn conversation history
- API endpoint: `https://api.anthropic.com/v1/messages`
- Get API key: https://console.anthropic.com

---

## 2. OpenAI

```env
AI_PROVIDER=openai
AI_API_KEY=sk-...                   # Your OpenAI API key

AI_MODEL=gpt-4-turbo                # Default
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

**Available models:**

| Model | Notes |
|---|---|
| `gpt-4-turbo` | Most capable (default) |
| `gpt-4` | Standard GPT-4 |
| `gpt-3.5-turbo` | Fast and cost-effective |

**Notes:**
- Native tool/function calling support
- API endpoint: `https://api.openai.com/v1/chat/completions`
- Get API key: https://platform.openai.com

---

## 3. GitHub Copilot (GitHub Models)

Uses your GitHub Personal Access Token to access hosted AI models via the Azure inference endpoint.

```env
AI_PROVIDER=github-copilot
AI_API_KEY=ghp_...                  # Your GitHub Personal Access Token
# OR
GITHUB_COPILOT_API_KEY=ghp_...      # Alternative key name (both are checked)

AI_MODEL=gpt-4o                     # Default
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

**Available models:**

| Model | Notes |
|---|---|
| `gpt-4o` | Most capable (default) |
| `gpt-4o-mini` | Faster, cost-efficient |
| `gpt-4-turbo` | GPT-4 Turbo |
| `gpt-4` | Standard GPT-4 |
| `gpt-3.5-turbo` | Fast and lightweight |

**Notes:**
- Requires a GitHub account with Copilot access
- Native tool/function calling support
- API endpoint: `https://models.inference.ai.azure.com/chat/completions`
- Get a PAT: GitHub → Settings → Developer settings → Personal access tokens

---

## 4. Google Gemini

```env
AI_PROVIDER=gemini
AI_API_KEY=AIza...                  # Your Google AI Studio API key

AI_MODEL=gemini-pro                 # Default
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

**Available models:**

| Model | Notes |
|---|---|
| `gemini-pro` | Text and reasoning (default) |
| `gemini-pro-vision` | Text + image understanding |

**Notes:**
- Tool calling supported
- API endpoint: `https://generativelanguage.googleapis.com/v1`
- Get API key: https://aistudio.google.com

---

## 5. Ollama (Local)

Runs models locally on your own hardware. No API key required. No data leaves your machine.

```env
AI_PROVIDER=ollama
# No API key needed

AI_MODEL=qwen2.5-coder:latest       # Default — any model you have pulled in Ollama
OLLAMA_BASE_URL=http://172.27.112.1:11434   # Optional: override default WSL host IP
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

**Popular models (pull with `ollama pull <model>`):**

| Model | Best For |
|---|---|
| `qwen2.5-coder:latest` | Coding and IT tasks (default) |
| `llama3:latest` | General purpose |
| `mistral:latest` | Fast and capable |
| `codellama:latest` | Code generation |
| `deepseek-coder:latest` | Code-focused tasks |
| Any pulled model | Use `ollama list` to see yours |

**Notes:**
- Default base URL `http://172.27.112.1:11434` targets the Windows host from WSL
- For local Linux installs use `http://localhost:11434`
- Tool calling support depends on the model (qwen2.5, llama3 support it)
- No API key required
- Install Ollama: https://ollama.com/download

---

## 6. Lemonade (Local OpenAI-compatible server)

A local OpenAI-compatible LLM server, optimized for CPU inference on small models.

```env
AI_PROVIDER=lemonade
# No API key needed

AI_MODEL=Qwen2.5-0.5B-Instruct-CPU     # Default
LEMONADE_BASE_URL=http://localhost:8000  # Optional: override default address
AI_MAX_TOKENS=2000                       # Note: capped to 256 internally (small context window)
AI_TEMPERATURE=0.7
```

**Notes:**
- Designed for small, CPU-friendly models with limited context windows (~2048 tokens)
- The system automatically trims conversation history to fit the context window
- Max output is internally capped at 256 tokens regardless of `AI_MAX_TOKENS`
- Tool calling is limited — model must support it
- API endpoint: `http://localhost:8000/v1/chat/completions`
- No API key required

---

## 7. Ollama Cloud

Hosted Ollama service at ollama.com. Same models and wire format as local Ollama, but cloud-hosted with a Bearer API key.

```env
AI_PROVIDER=ollama-cloud
OLLAMA_CLOUD_API_KEY=your_key_here      # API key from ollama.com

AI_MODEL=nemotron-3-super               # Default
OLLAMA_CLOUD_BASE_URL=https://ollama.com  # Optional: already the default
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
```

**Popular cloud models:**

| Model | Notes |
|---|---|
| `nemotron-3-super` | Default — NVIDIA Nemotron, strong reasoning |
| `llama3.3` | Meta Llama 3.3 |
| `gemma3` | Google Gemma 3 |
| `phi4` | Microsoft Phi-4 |
| `mistral` | Mistral AI |
| `deepseek-r1` | DeepSeek R1 reasoning model |

**Notes:**
- Same `/api/chat` wire format as local Ollama
- Tool calling supported when the chosen model supports it
- Models that narrate tool calls as text are handled automatically by the agent loop
- API endpoint: `https://ollama.com/api/chat`
- Get API key: https://ollama.com → Account → API Keys

---

## API Key Resolution Order

The system checks environment variables in this order:

```
1. OLLAMA_CLOUD_API_KEY   (only for ollama-cloud provider)
2. AI_API_KEY             (universal fallback — works for any cloud provider)
3. ANTHROPIC_API_KEY      (Anthropic-specific alias)
4. GITHUB_COPILOT_API_KEY (GitHub Copilot-specific alias)
```

Local providers (`ollama`, `lemonade`) do not require any API key.

---

## Tool Calling Support

| Provider | Tool Calling | Notes |
|---|---|---|
| `anthropic` | ✅ Full | Native support, most reliable |
| `openai` | ✅ Full | Native support |
| `github-copilot` | ✅ Full | Depends on selected model |
| `gemini` | ✅ Full | Native support |
| `ollama` | ⚠️ Model-dependent | qwen2.5, llama3 support it; others may narrate |
| `lemonade` | ⚠️ Limited | Small context window restricts multi-tool tasks |
| `ollama-cloud` | ⚠️ Model-dependent | Same as local Ollama |

> **Note:** When a model narrates a tool call as text (e.g. `"Calling send_email with arguments: {...}"`) instead of using the API mechanism, the agent loop automatically detects and executes it.

---

## Quick Switcher Examples

**Use Anthropic Claude Sonnet (speed/cost balance):**
```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-6
```

**Use local Ollama with Llama 3:**
```env
AI_PROVIDER=ollama
AI_MODEL=llama3:latest
```

**Use Ollama Cloud with DeepSeek R1:**
```env
AI_PROVIDER=ollama-cloud
OLLAMA_CLOUD_API_KEY=your_key_here
AI_MODEL=deepseek-r1
```

**Use GitHub Copilot with GPT-4o Mini (free tier):**
```env
AI_PROVIDER=github-copilot
GITHUB_COPILOT_API_KEY=ghp_...
AI_MODEL=gpt-4o-mini
```
