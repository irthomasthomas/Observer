# Observer AI 🚀!

Local Open-source micro-agents that observe, log and react, all while keeping your data private and secure.

<div align="center">

[![Observer App Online](https://img.shields.io/badge/🌐_Observer_App-Online-blue?style=for-the-badge&color=4CAF50)](https://app.observer-ai.com/)
[![Download App](https://img.shields.io/badge/⬇️_Download-Latest_Release-blue?style=for-the-badge&color=2196F3)](https://github.com/Roy3838/Observer/releases/latest/)
[![Support Project](https://img.shields.io/badge/☕_Support-Buy_Me_Coffee-blue?style=for-the-badge&color=FF9800)](https://buymeacoffee.com/roy3838)

</div>


[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Deployed-success)](https://roy3838.github.io/observer-ai)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🔧 Agent Superpowers

### 📊 **Intelligent Logging & Memory**
- **Screen Recording** - Start Recording intelligently or analyze video clips with custom labels.
- **Audio Intelligence** - Listen to microphone, screen audio, or both simultaneously.
- **Text and Visual Memory** - Store and retrieve images for context-aware decisions.

### 🚨 **Multi-Channel Notifications**
- **📧 Email Alerts** - Get Emails with image attachments
- **💬 Discord Integration** - Real-time server notifications with rich media
- **📱 Telegram Messages** - Instant mobile alerts via Observer bot
- **📞 SMS Notifications** - Direct text messaging (non USA/Canada) 
- **💚 WhatsApp Alerts** - Get messages on your favorite messaging platform
- **🖥️ System Notifications** - Native OS alerts and pop-ups
- **📺 Observer Overlay** - Custom on-screen messages and status updates

*Build simple local agents that don't just watch, they **understand**, **remember**, and **act** intelligently on your behalf.*

## 📹 Why Observer AI?

<div align="center">

[![Observer AI Demo](https://img.youtube.com/vi/i5WDvQy0XJA/0.jpg)](https://www.youtube.com/watch?v=i5WDvQy0XJA)

</div>

# 🏗️ Building Your Own Agent

Creating your own Observer AI agent is simple, and consist of three things:

* SENSORS - input that your model will have
* MODELS - models run by ollama or by Ob-Server
* TOOLS - functions for your model to use

## Quick Start

1. Navigate to the Agent Dashboard and click "Create New Agent"
2. Fill in the "Configuration" tab with basic details (name, description, model, loop interval)
3. Give your model a system prompt and Sensors! The current Sensors that exist are:
   * **Screen OCR** ($SCREEN_OCR) Captures screen content as text via OCR
   * **Screenshot** ($SCREEN_64) Captures screen as an image for multimodal models
   * **Agent Memory** ($MEMORY@agent_id) Accesses agents' stored information
   * **Agent Image Memory** ($IMEMORY@agent_id) Accesses agents' stored images
   * **Clipboard** ($CLIPBOARD) It pastes the clipboard contents 
   * **Microphone**\* ($MICROPHONE) Captures the microphone and adds a transcription
   * **Screen Audio**\* ($SCREEN_AUDIO) Captures the audio transcription of screen sharing a tab.
   * **All audio**\* ($ALL_AUDIO) Mixes the microphone and screen audio and provides a complete transcription of both (used for meetings).

\* Uses a whisper model with transformers.js

Agent Tools:
  * `getMemory(agentId)*` – Retrieve stored memory 
  * `setMemory(agentId, content)*` – Replace stored memory  
  * `appendMemory(agentId, content)*` – Add to existing memory  
  * `getImageMemory(agentId)*` - Retrieve images stored in memory 
  * `setImageMemory(agentId, images)` - Set images to memory
  * `appendImageMemory(agentId, images)` - Add images to memory
  * `startAgent(agentId)*` – Starts an agent  
  * `stopAgent(agentId)*` – Stops an agent
  * `time()` - Gets current time
  * `sleep(ms)` - Waits that ammount of miliseconds

Notification Tools:
  * `sendEmail(email, message, images?)` - Sends an email
  * `sendPushover(user_token, message, images?, title?)` - Sends a pushover notification.
  * `sendDiscord(discord_webhook, message, images?)`Sends a discord message to a server.
  * `sendTelegram(chat_id, message, images?)` Sends a telegram message with the Observer bot. Get the chat_id messaging the bot @observer_notification_bot.
  * `notify(title, options)` – Send browser notification ⚠️IMPORTANT: Some browsers block notifications
  * `sendSms(phone_number, message, images?)` - Sends an SMS to a phone number, format as e.g. sendSms("hello",+181429367"). ⚠️IMPORTANT : Due to A2P policy, some SMS messages are being blocked, not recommended for US/Canada.
  * `sendWhatsapp(phone_number, message)` - Sends a whatsapp message, ⚠️IMPORTANT: Due to anti-spam rules, it is recommended to send a Whatsapp Message to the numer "+1 (555) 783 4727", this opens up a 24 hour window where Meta won't block message alerts sent by this number. TEMPORARILY BLOCKED due to spam :c

Video Recording Tools: 
  * `startClip()` - Starts a recording of any video media and saves it to the recording Tab.
  * `stopClip()` - Stops an active recording
  * `markClip(label)` - Adds a label to any active recording that will be displayed in the recording Tab.

App Tools:
  * `ask(question, title="Confirmation")` - Pops up a system confirmation dialog 
  * `message(message, title="Agent Message")` - Pops up a system message
  * `system_notify(body, title="Observer AI")` - Sends a system notification
  * `overlay(body)` - Pushes a message to the overlay



## Code Tab

The "Code" tab receives the following variables as context before running: 
`response` - The model's response
`agentId` - The id of the agent running the code
`screen` - The screen as base64 if captured 
`camera` - The camera as base64 if captured 
`imemory` - The agent's current image array
`images` - All images in context

JavaScript agents run in the browser sandbox, making them ideal for passive monitoring and notifications:

```javascript
// Remove Think tags for deepseek model
const cleanedResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Get time
const time = time();

// Update memory with timestamp
appendMemory(`[${time}] ${cleanedResponse}`);

// Send to Telegram for notekeeping
sendTelegram(cleanedResponse, "12345678") // Example chat_id
```

> **Note:** any function marked with `*` takes an `agentId` argument.  
> If you omit `agentId`, it defaults to the agent that’s running the code.


https://github.com/user-attachments/assets/c5af311f-7e10-4fde-9321-bb98ceebc271


> ✨ **Major Update: Simpler Setup & More Flexibility!**
> The `observer-ollama` service no longer requires SSL by default. This means **no more browser security warnings** for a standard local setup! It now also supports any backend that uses a standard OpenAI-compatible (`v1/chat/completions`) endpoint, like Llama.cpp.

There are a few ways to get Observer up and running with local inference. I recommend using Docker for the simplest setup.

## Option 1: Just Install the Desktop App with any OpenAI compatible endpoint (Ollama, llama.cpp, vLLM)

## [Download Official App](https://github.com/Roy3838/Observer/releases/latest/)

Download Ollama for the best compatibility. 

Observer can connect directly to any server that provides a `v1/chat/completions` endpoint.
Set the `Custom Model Server URL` on the App to vLLM, llama.cpp or any OpenAI compatible endpoint if not using Ollama.

## Option 2: Full Docker Setup (Deprecated)

This method uses Docker Compose to run everything you need in containers: the Observer WebApp, the `observer-ollama` translator, and a local Ollama instance. This is the easiest way to get a 100% private, local-first setup.

**Prerequisites:**
*   [Docker](https://docs.docker.com/get-docker/) installed.
*   [Docker Compose](https://docs.docker.com/compose/install/) installed.

**Instructions:**

1.  **Clone the repository and start the services:**
    ```bash
    git clone https://github.com/Roy3838/Observer.git
    cd Observer
    docker-compose up --build
    ```

2.  **Access the Local WebApp:**
    *   Open your browser to **`http://localhost:8080`**. This is your self-hosted version of the Observer app.

3.  **Connect to your Ollama service:**
    *   In the app's header/settings, set the Model Server Address to **`http://localhost:3838`**. This is the `observer-ollama` translator that runs in a container and communicates with Ollama for you.

4.  **Pull Ollama Models:**
    *   Navigate to the "Models" tab and click "Add Model". This opens a terminal to your Ollama instance.
    *   Pull any model you need, for example:
        ```bash
        ollama run gemma3:4b # <- highly recommended model!
        ```
        
For NVIDIA GPUs: it's recommended to edit `docker-compose.yml` and explicitly add gpu runtime to the ollama docker container.
Add these to the ollama section of `docker-compose.yml`:
```
    volumes:
      - ollama_data:/root/.ollama
    # ADD THIS SECTION
    runtime: nvidia
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    # UP TO HERE
    ports:
      - "11434:11434"
```

**To Stop the Docker Setup:**
```bash
docker-compose down
```

---
### ⚙️ Configuration (Docker)

To customize your setup (e.g., enable SSL to access from `app.observer-ai.com`, disabling docker exec feature), simply edit the `environment:` section in your `docker-compose.yml` file. All options are explained with comments directly in the file.


### Setting Up Python (Jupyter Server)

Python agents run on a Jupyter server with system-level access, enabling them to interact directly with your computer:

```python
#python <-- don't remove this!
print("Hello World!", response, agentId)

# Example: Analyze screen content and take action
if "SHUTOFF" in response:
    # System level commands can be executed here
    import os
    # os.system("command")  # Be careful with system commands!
```

## Jupyter Server Configuration

To use Python agents:

1. Run a Jupyter server on your machine with c.ServerApp.allow_origin = '*'
2. Configure the connection in the Observer AI interface:
   * Host: The server address (e.g., 127.0.0.1)
   * Port: The server port (e.g., 8888)
   * Token: Your Jupyter server authentication token
3. Test the connection using the "Test Connection" button
4. Switch to the Python tab in the code editor to write Python-based agents

# 🚀 Getting Started with Local Inference

## Deploy & Share

Save your agent, test it from the dashboard, and export the configuration to share with others!

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Website](https://observer-ai.com)
- [GitHub Repository](https://github.com/Roy3838/Observer)
- [twitter](https://x.com/AppObserverAI)

## 📧 Contact

- GitHub: [@Roy3838](https://github.com/Roy3838)
- Project Link: [https://observer-ai.com](https://observer-ai.com)

---

Built with ❤️  by Roy Medina for the Observer AI Community
Special thanks to the Ollama team for being an awesome backbone to this project!
