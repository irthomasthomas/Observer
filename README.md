# Observer AI 👁️

An open-source platform for running local AI agents that enhance your computing experience while preserving privacy.

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Deployed-success)](https://roy3838.github.io/observer-ai)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🚀 Overview

Observer AI is a privacy-first platform that lets you run AI agents with Ollama, locally on your machine. These agents can observe and assist with your computing tasks while ensuring your data never leaves your computer.

### Key Features

- 🔒 **Privacy First**: All processing happens locally on your machine
- 💻 **Resource Efficient**: Take advantage of unused consumer-grade hardware
- 🔌 **Extensible**: Easy-to-use framework for creating and sharing custom agents
- 🤝 **Community Driven**: Growing ecosystem of community-created agents

## 🚀 Getting Started

```bash
# For local inference run observer-ollama
pip install observer-ollama

# Click on the link provided so that your browser accepts self signed CERTS (signed by your computer)
#  OLLAMA-PROXY  ready
#  ➜  Local:   https://localhost:3838/
#  ➜  Network: https://10.0.0.138:3838/

# Go to webapp:
app.observer-ai.com

# Enter your inference IP 
```

# 🏗️ Building Your Own Agent

Creating your own Observer AI agent is simple and accessible to both beginners and experienced developers.

## Quick Start

1. Navigate to the Agent Dashboard and click "Create New Agent"
2. Fill in the "Configuration" tab with basic details (name, description, model, loop interval)
3. Use the "Context" tab to visually build your agent's input sources by adding blocks:
   * **Screen OCR** block: Captures screen content as text via OCR
   * **Screenshot** block: Captures screen as an image for multimodal models
   * **Agent Memory** block: Accesses other agents' stored information

## Code Tab

The "Code" tab now offers a notebook-style coding experience where you can:

* Write JavaScript code that executes with each agent iteration
* Access the `response` variable containing the model's output
* Utilize utilities for various operations:

```javascript
// Remove Think tags for deepseek model
const cleanedResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Preserve previous memory
const prev_res = utilities.getAgentMemory(agentId);

// Get time
const time = utilities.getCurrentTime();

// Update memory with timestamp
prev_res.then(memory => {
    utilities.updateAgentMemory(agentId, `${memory} \n[${time}]: ${cleanedResponse} \n`);
});
```

Available utilities include:
* `utilities.getCurrentTime()` - Get the current timestamp
* `utilities.pushNotification(title, options)` - Send notifications
* `utilities.updateAgentMemory(agentId, content)` - Store information
* `utilities.getAgentMemory(agentId)` - Retrieve stored information

## Example: Activity Tracker

A simple agent that logs what you're doing:
* System prompt with Screen OCR/Screenshot blocks to capture content
* Code that processes the response and logs observations to memory:

```javascript
// Extract activity details from response
const activity = response.includes("ACTIVITY:") 
    ? response.split("ACTIVITY:")[1].trim() 
    : response;

// Get previous memory
const memory = await utilities.getAgentMemory(agentId);

// Add timestamp and save
const timestamp = utilities.getCurrentTime();
utilities.updateAgentMemory(
    agentId, 
    `${memory}\n[${timestamp}] ${activity}`
);

// Notify about interesting activities
if (activity.includes("meeting") || activity.includes("important")) {
    utilities.pushNotification("Activity Alert", {
        body: `Detected: ${activity}`
    });
}
```

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

- [Website](https://roy3838.github.io/observer-ai)
- [GitHub Repository](https://github.com/Roy3838/observer-ai)

## 📧 Contact

- GitHub: [@Roy3838](https://github.com/Roy3838)
- Project Link: [https://github.com/Roy3838/observer-ai](https://github.com/Roy3838/observer-ai)

---

Built with ❤️  by the Observer AI Community
