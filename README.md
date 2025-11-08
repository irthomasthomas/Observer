<div align="center">

# 👁️ Observer AI

### *Local Micro-Agents That Observe, Log and React*

Build powerful micro-agents that observe your digital world, remember what matters, and react intelligently—all while keeping your data **100% private and secure**.

[![Observer App Online](https://img.shields.io/badge/🌐_Observer_App-Online-blue?style=for-the-badge&color=4CAF50)](https://app.observer-ai.com/)
[![Download App](https://img.shields.io/badge/⬇️_Download-Latest_Release-blue?style=for-the-badge&color=2196F3)](https://github.com/Roy3838/Observer/releases/latest/)
[![Support Project](https://img.shields.io/badge/☕_Support-Buy_Me_Coffee-blue?style=for-the-badge&color=FF9800)](https://buymeacoffee.com/roy3838)

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Deployed-success)](https://roy3838.github.io/observer-ai)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 👁️ How Observer Agents Work

<div align="center">

<table>
<tr>
<td align="center" valign="middle">

### Sensors →

</td>
<td align="center" valign="middle">

### Models →

</td>
<td align="center" valign="middle">

### Tools
<br>
</td>
</tr>
<tr>
<td align="center" valign="middle">

<img src="https://img.icons8.com/fluency/96/monitor.png" width="48" height="48" alt="Screen"/>
<img src="https://img.icons8.com/fluency/96/camera.png" width="48" height="48" alt="Camera"/>
<img src="https://img.icons8.com/fluency/96/microphone.png" width="48" height="48" alt="Mic"/>
<img src="https://img.icons8.com/fluency/96/speaker.png" width="48" height="48" alt="Audio"/>

<br><sub>Screen • Camera • Mic • Audio</sub>

</td>
<td align="center" valign="middle">

<img src="https://img.icons8.com/fluency/96/brain.png" width="64" height="64" alt="AI Brain"/>

<br><sub>Local LLMs</sub>

</td>
<td align="center" valign="middle">

<img src="https://cdn.simpleicons.org/whatsapp/25D366" width="40" height="40" alt="WhatsApp"/>
<img src="https://cdn.simpleicons.org/discord/5865F2" width="40" height="40" alt="Discord"/>
<img src="https://cdn.simpleicons.org/telegram/26A5E4" width="40" height="40" alt="Telegram"/>
<img src="https://cdn.simpleicons.org/iMessage/0084FF" width="40" height="40" alt="SMS"/>
<img src="https://img.icons8.com/fluency/96/note.png" width="40" height="40" alt="Memory"/>
<img src="https://img.icons8.com/fluency/96/code.png" width="40" height="40" alt="Code"/>

<br><sub>Messaging • Notifications • Recording • Memory • Code</sub>

</td>
</tr>
</table>

<br>

</div>

</div>

---

## 🎯 What Observer AI Does Best

<table>
<tr>
<td width="50%" valign="top">

### 📊 **Intelligent Logging**

🧠 **Text & Visual Memory**

🎥 **Smart Screen Recording**

💾 **Inteligent Context**

</td>
<td width="50%" valign="top">

### 🚨 **Powerful Notifications**

📧 **Email** • 💬 **Discord** • 📱 **Telegram**
📞 **SMS** • 💚 **WhatsApp**

🖥️ **System Alerts**
Native OS notifications and pop-ups

📺 **Observer Overlay**
Custom on-screen messages

</td>
</tr>
</table>

---

## 🎬 Quick Demo: Security Agent

[![Security Agent Demo](https://img.youtube.com/vi/jsjr_zRWXG4/0.jpg)](https://www.youtube.com/watch?v=jsjr_zRWXG4)

---

# 🏗️ Building Your Own Agent

Creating your own Observer AI consist of three things:

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
  * `sendWhatsapp(phone_number, message)` - Sends a whatsapp message with the Observer bot. Send a message first to +1 (555)783-4727 to use.
  * `notify(title, options)` – Send browser notification ⚠️IMPORTANT: Some browsers block notifications
  * `sendSms(phone_number, message, images?)` - Sends an SMS to a phone number, format as e.g. sendSms("hello",+181429367"). ⚠️IMPORTANT : Due to A2P policy, some SMS messages are being blocked, not recommended for US/Canada.

Video Recording Tools: 
  * `startClip()` - Starts a recording of any video media and saves it to the recording Tab.
  * `stopClip()` - Stops an active recording
  * `markClip(label)` - Adds a label to any active recording that will be displayed in the recording Tab.

App Tools:
  * `ask(question, title="Confirmation")` - Pops up a system confirmation dialog
  * `message(message, title="Agent Message")` - Pops up a system message
  * `system_notify(body, title="Observer AI")` - Sends a system notification
  * `overlay(body)` - Pushes a message to the overlay
  * `click()` - Triggers a mouse click at the current cursor position ⚠️IMPORTANT: Position mouse before agent runs

> **Note:** any function marked with `*` takes an `agentId` argument.  
> If you omit `agentId`, it defaults to the agent that’s running the code.

## Code Tab

The "Code" tab receives the following variables as context before running: 
* `prompt` - The model's prompt
* `response` - The model's response
* `agentId` - The id of the agent running the code
* `screen` - The screen as base64 if captured 
* `camera` - The camera as base64 if captured 
* `imemory` - The agent's current image array
* `images` - All images in context

JavaScript agents run in the browser sandbox, making them ideal for passive monitoring and notifications:

```javascript
// Remove Think tags for deepseek model
const cleanedResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Get time
const time = time();

// Update memory with timestamp
appendMemory(`[${time}] ${cleanedResponse}`);

// Send to Telegram if the model mentions a word
if(response.includes("word")){
  sendTelegram(cleanedResponse, "12345678") // Example chat_id
}
```


# 🚀 Getting Started with Local Inference


There are a few ways to get Observer up and running with local inference. I recommend the Observer App. 

## Option 1: Just Install the Desktop App with any OpenAI compatible endpoint (Ollama, llama.cpp, vLLM)

Download the Official App:

[![Download App](https://img.shields.io/badge/⬇️_Download-Latest_Release-blue?style=for-the-badge&color=2196F3)](https://github.com/Roy3838/Observer/releases/latest/)

Download Ollama for the best compatibility. Observer can connect directly to any server that provides a `v1/chat/completions` endpoint.

### vLLM, llama.cpp, LMStudio etc: 
Set the `Custom Model Server URL` on the App to any OpenAI compatible endpoint if not using Ollama.

NOTE: Your browser app sends the request to `localhost:3838` which the ObserverApp proxies to your `Custom Model Server URL`, this is because of CORS. 


## Option 2: Full Docker Setup (Deprecated)

For Docker setup instructions, see [docker/DOCKER.md](docker/DOCKER.md).


### Setting Up Python (Jupyter Server) 

For Jupyter server setup instructions, see [app/JUPYTER.md](app/JUPYTER.md).


## Deploy & Share

Save your agent, test it from the dashboard, and upload to community to share with others!

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
- [Twitter](https://x.com/AppObserverAI)
- [YouTube](https://www.youtube.com/@Observer-AI)
- [Tiktok](https://www.tiktok.com/@observerai)

---

Built with ❤️  by Roy Medina for the Observer AI Community
Special thanks to the Ollama team for being an awesome backbone to this project!
