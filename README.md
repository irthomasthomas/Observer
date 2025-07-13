# Observer AI Just Launched Today 🚀! Support the project on ProductHunt!
## [ProductHunt Link](https://www.producthunt.com/products/observer-ai?utm_source=other&utm_medium=social)

## It's not spying... if it's for you 👀
Local Open-source micro-agents that observe, log and react, all while keeping your data private and secure.


[Observer App Link](https://app.observer-ai.com/)

- [Support me and the project!](https://buymeacoffee.com/roy3838)

An open-source platform for running local AI agents that observe your screen while preserving privacy.


[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Deployed-success)](https://roy3838.github.io/observer-ai)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

# 🚀 Take a quick look:

https://github.com/user-attachments/assets/27b2d8e5-59c0-438a-999c-fc54b8c2cb95

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
   * **Clipboard** ($CLIPBOARD) It pastes the clipboard contents 
   * **Microphone**\* ($MICROPHONE) Captures the microphone and adds a transcription
   * **Screen Audio**\* ($SCREEN_AUDIO) Captures the audio transcription of screen sharing a tab.
   * **All audio**\* ($ALL_AUDIO) Mixes the microphone and screen audio and provides a complete transcription of both (used for meetings).

\* Uses a whisper model with transformers.js (only supports whisper-tiny english for now)

4. Decide what tools do with your models `response` in the Code Tab:
  * `notify(title, options)` – Send notifications  
  * `getMemory(agentId)*` – Retrieve stored memory (defaults to current agent)  
  * `setMemory(agentId, content)*` – Replace stored memory  
  * `appendMemory(agentId, content)*` – Add to existing memory  
  * `startAgent(agentId)*` – Starts an agent  
  * `stopAgent(agentId)*` – Stops an agent
  * `time()` - Gets current time
  * `sendEmail(content, email)` - Sends an email
  * `sendSms(content, phone_number)` - Sends an SMS to a phone number, format as e.g. sendSms("hello",+181429367")
  * `sendWhatsapp(content, phone_number)` - Sends a whatsapp message, IMPORTANT: temporarily to counter anti spam, Observer is sending only static messages disregarding "content" variable.
  * `startClip()` - Starts a recording of any video media and saves it to the recording Tab.
  * `stopClip()` - Stops an active recording
  * `markClip(label)` - Adds a label to any active recording that will be displayed in the recording Tab.

## Code Tab

The "Code" tab now offers a notebook-style coding experience where you can choose between JavaScript or Python execution:

### JavaScript (Browser-based)

JavaScript agents run in the browser sandbox, making them ideal for passive monitoring and notifications:

```javascript
// Remove Think tags for deepseek model
const cleanedResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Preserve previous memory
const prevMemory = await getMemory();

// Get time
const time = time();

// Update memory with timestamp
appendMemory(`[${time}] ${cleanedResponse}`);
```

> **Note:** any function marked with `*` takes an `agentId` argument.  
> If you omit `agentId`, it defaults to the agent that’s running the code.

### Python (Jupyter Server)

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

The Python environment receives:
* `response` - The model's output
* `agentId` - The current agent's ID

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

https://github.com/user-attachments/assets/c5af311f-7e10-4fde-9321-bb98ceebc271


> ✨ **Major Update: Simpler Setup & More Flexibility!**
> The `observer-ollama` service no longer requires SSL by default. This means **no more browser security warnings** for a standard local setup! It now also supports any backend that uses a standard OpenAI-compatible (`v1/chat/completions`) endpoint, like Llama.cpp.

There are a few ways to get Observer up and running with local inference. I recommend using Docker for the simplest setup.

## Option 1: Just host the webapp with any OpenAI compatible endpoint.

Observer can connect directly to any server that provides a `v1/chat/completions` endpoint.

**Prerequisites:**
*   [Node.js v18+](https://nodejs.org/) (which includes npm).

1.  **Self-host the WebApp:** with run script
    ```
    git clone https://github.com/Roy3838/Observer
    cd Observer
    chmod +x run.sh
    ./run.sh
    ```
2.  **Run your Llama.cpp server:**
    ```bash
    # Example command
    ./server -m your-model.gguf -c 4096 --host 0.0.0.0 --port 8001
    ```
3.  **Connect Observer:** In the Observer app (`http://localhost:8080`), set the Model Server Address to your Llama.cpp server's address (e.g., `http://127.0.0.1:8001`).


## Option 2: Full Docker Setup (Recommended)

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
### Advanced Use-Case: Connecting Across Your Network and Using Auth Tools

If you need to access your local inference server from another device (like your phone) or want to use the authenticated tools (`sendEmail`, etc.), you must use the public WebApp (`app.observer-ai.com`) and **re-enable SSL** on your local server.

1.  **Enable SSL in Docker:**
    *   Open the file: `supervisord.conf`
    *   Find the `command` line and **remove the `--disable-ssl` flag**.
    *   **Change this:** `command=... --disable-ssl ...`
    *   **To this:** `command=... --enable-exec ...` (just remove the ssl flag)

2.  **Rebuild and Restart Docker:**
    ```bash
    docker-compose up --build --force-recreate
    ```

3.  **Trust the Certificate:**
    *   Your `observer-ollama` service is now at `https://<YOUR-PC-IP>:3838`.
    *   Open that address in your browser (e.g., `https://192.168.1.10:3838`). You'll see a security warning. Click "Advanced" and "Proceed (unsafe)" to trust the certificate.

4.  **Connect from the Public App:**
    *   Go to **`https://app.observer-ai.com`**.
    *   In the header/settings, set the Model Server Address to `https://<YOUR-PC-IP>:3838`. It should now connect successfully.


---
## Option 3: Standalone `observer-ollama` (`pip`) (Already have system ollama installed)

Use this if you already have Ollama running on your machine and prefer not to use Docker for the translator.

**Prerequisites:**
*   [Python 3.8+](https://www.python.org/downloads/)
*   [Ollama](https://ollama.com/) installed and running.

**Instructions:**

1.  **Install the package:**
    ```bash
    pip install observer-ollama
    ```

2.  **Run the translator:**
    *   **For local use (Default, No SSL):**
        ```bash
        observer-ollama --disable-ssl
        ```
        The service starts on `http://localhost:3838`. Connect to it from your self-hosted or public web app.

    *   **For use with `app.observer-ai.com` (SSL Required):**
        ```bash
        observer-ollama
        ```
        The service starts on `https://localhost:3838`. You must visit this URL and accept the security warning before it can be used from the public web app.

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
