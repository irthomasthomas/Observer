#!/usr/bin/env python3
import http.server
import urllib.request
import urllib.error
import ssl
import subprocess
import sys
import logging
import socket
import threading
import time
import json
import os

# Setup logging
logger = logging.getLogger('ollama-proxy.handler')

OLLAMA_TARGET_HOST = os.environ.get("OLLAMA_SERVICE_HOST", "ollama")
OLLAMA_TARGET_PORT = os.environ.get("OLLAMA_SERVICE_PORT", "11434")
OLLAMA_BASE_URL = f"http://{OLLAMA_TARGET_HOST}:{OLLAMA_TARGET_PORT}"

class OllamaProxy(http.server.BaseHTTPRequestHandler):
    # Quieter logs - only errors by default
    def log_message(self, format, *args):
        if args[1][0] in ['4', '5']:  # Only log 4xx and 5xx errors
            logger.error("%s - %s", self.address_string(), format % args)
        else:
            logger.debug("%s - %s", self.address_string(), format % args)
    
    def do_OPTIONS(self):
        logger.debug(f"OPTIONS request to {self.path}")
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        logger.debug(f"GET request to {self.path} from {self.address_string()}")
        if self.path.startswith('/exec'):
            self.handle_exec_request()
        elif self.path == '/quota':
            self.handle_quota_request()
        elif self.path == '/favicon.ico':
            self.handle_favicon_request()
        else:
            self.proxy_request("GET")
    
    def do_POST(self):
        logger.debug(f"POST request to {self.path}")
        self.proxy_request("POST")
    
    def send_cors_headers(self):
        origin = self.headers.get('Origin', '')
        allowed_origins = ['http://localhost:3000', 'http://localhost:3001', 'https://localhost:3000']
        
        logger.debug(f"Request origin: {origin}")
        if origin in allowed_origins or self.server.dev_mode:
            logger.debug(f"Allowing specific origin: {origin}")
            self.send_header("Access-Control-Allow-Origin", origin or "*")
        else:
            logger.debug("Using wildcard origin")
            self.send_header("Access-Control-Allow-Origin", "*")
            
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Max-Age", "86400")  # 24 hours
    
    def proxy_request(self, method):
        target_path = self.path
        content_length = int(self.headers.get('Content-Length', 0))
        logger.debug(f"Request content length: {content_length}")
        
        body = None
        if content_length > 0:
            try:
                body = self.rfile.read(content_length)
                logger.debug(f"Read {len(body)} bytes from request body")
            except Exception as e:
                logger.error(f"Error reading request body: {e}")
        
        # Handle the chat completions endpoint
        if method == "POST" and body and self.path == '/v1/chat/completions':
            try:
                request_data = json.loads(body)
                logger.debug(f"Request data keys: {list(request_data.keys())}")
                
                # Check if this has messages with content
                if ('messages' in request_data and 
                    isinstance(request_data['messages'], list) and 
                    len(request_data['messages']) > 0 and 
                    'content' in request_data['messages'][0]):
                    
                    model = request_data.get('model', '')
                    logger.debug(f"Model: {model}")
                    
                    first_message = request_data['messages'][0]
                    content = first_message.get('content', '')
                    
                    # Simple chat message - pass through normal text
                    if isinstance(content, str):
                        target_path = "/api/generate"
                        ollama_request = {
                            'model': model,
                            'prompt': content,
                            'stream': request_data.get('stream', False)
                        }
                        body = json.dumps(ollama_request).encode('utf-8')
                        logger.debug("Converted text-only request to Ollama format")
                    
                    # Handle multimodal content (images)
                    elif isinstance(content, list):
                        logger.debug("Processing multimodal content list")
                        prompt_text = ""
                        images = []
                        
                        # Extract text and images from the message
                        for item in content:
                            if isinstance(item, dict):
                                if item.get('type') == 'text':
                                    prompt_text += item.get('text', '')
                                    logger.debug(f"Added text: {item.get('text', '')[:50]}...")
                                elif item.get('type') == 'image_url':
                                    image_url = item.get('image_url', {}).get('url', '')
                                    
                                    # Log the first part of the image url for debugging
                                    if image_url:
                                        url_preview = image_url[:30] + "..." if len(image_url) > 30 else image_url
                                        logger.debug(f"Found image URL: {url_preview}")
                                        
                                        if image_url.startswith('data:image'):
                                            logger.debug("Processing base64 image")
                                            # Get just the base64 part
                                            if ',' in image_url:
                                                base64_data = image_url.split(',', 1)[1]
                                                logger.debug(f"Base64 data length: {len(base64_data)} bytes")
                                                images.append(base64_data)
                                            else:
                                                logger.warning("Image URL does not contain comma separator")
                                                images.append(image_url)
                                        else:
                                            # Non-base64 URL
                                            images.append(image_url)
                        
                        if images:
                            logger.info(f"Translating request to Ollama native format for {len(images)} images")
                            target_path = "/api/generate"
                            ollama_request = {
                                'model': model,
                                'prompt': prompt_text,
                                'images': images,
                                'stream': request_data.get('stream', False)
                            }
                            
                            # Add any other parameters that should be forwarded
                            for key in ['temperature', 'top_p', 'top_k', 'seed']:
                                if key in request_data:
                                    ollama_request[key] = request_data[key]
                                    
                            body = json.dumps(ollama_request).encode('utf-8')
                            logger.debug(f"Translated request size: {len(body)} bytes")
            except Exception as e:
                logger.error(f"Error processing request: {e}")
                import traceback
                logger.debug(f"Traceback: {traceback.format_exc()}")
        
        target_url = f"{OLLAMA_BASE_URL}{target_path}"
        logger.debug(f"Forwarding request to: {target_url}")
        
        req = urllib.request.Request(target_url, data=body, method=method)
        
        # Forward relevant headers
        headers_to_forward = ['Content-Type', 'Authorization', 'User-Agent']
        for header in headers_to_forward:
            if header in self.headers:
                logger.debug(f"Forwarding header: {header}")
                req.add_header(header, self.headers[header])
        
        # Use a much longer timeout for /api/generate endpoint
        timeout = 300 if target_path == '/api/generate' else 60  # 5 minutes for generate
        logger.debug(f"Using timeout of {timeout} seconds")
        
        try:
            logger.debug("Opening connection to Ollama server")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                logger.debug(f"Ollama response status: {response.status}")
                self.send_response(response.status)
                
                # Forward response headers excluding problematic ones
                for key, val in response.getheaders():
                    if key.lower() not in ['transfer-encoding', 'connection', 'content-length']:
                        logger.debug(f"Forwarding response header: {key}")
                        self.send_header(key, val)
                
                self.send_cors_headers()
                self.end_headers()
                
                # For API generate responses, convert back to OpenAI format
                if target_path == '/api/generate' and self.path == '/v1/chat/completions':
                    logger.debug("Reading Ollama native API response for translation")
                    # Read the entire response
                    response_data = response.read()
                    logger.debug(f"Read {len(response_data)} bytes from Ollama response")
                    
                    try:
                        # Parse the response from Ollama's native format
                        ollama_response = json.loads(response_data)
                        logger.debug(f"Ollama response keys: {list(ollama_response.keys())}")
                        
                        # Convert to OpenAI-compatible format
                        openai_response = {
                            "id": f"chatcmpl-{time.time()}",
                            "object": "chat.completion",
                            "created": int(time.time()),
                            "model": ollama_response.get("model", "unknown"),
                            "choices": [
                                {
                                    "index": 0,
                                    "message": {
                                        "role": "assistant",
                                        "content": ollama_response.get("response", "")
                                    },
                                    "finish_reason": "stop"
                                }
                            ],
                            "usage": {
                                "prompt_tokens": -1,
                                "completion_tokens": -1,
                                "total_tokens": -1
                            }
                        }
                        
                        logger.debug("Successfully translated Ollama response to OpenAI format")
                        
                        # Write the transformed response
                        transformed_response = json.dumps(openai_response).encode('utf-8')
                        self.wfile.write(transformed_response)
                        logger.debug(f"Wrote {len(transformed_response)} bytes of translated response")
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse Ollama response: {e}")
                        # If we can't parse it, return as-is
                        self.wfile.write(response_data)
                        logger.debug(f"Wrote {len(response_data)} bytes of original response")
                else:
                    # Stream the response back for non-translated requests
                    logger.debug("Streaming regular response")
                    bytes_sent = 0
                    while True:
                        chunk = response.read(4096)  # Read in chunks
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        bytes_sent += len(chunk)
                    logger.debug(f"Streamed {bytes_sent} bytes in total")
                    
        except urllib.error.HTTPError as e:
            # Forward HTTP errors from the target server
            logger.error(f"HTTP error from Ollama: {e.code} - {e.reason}")
            self.send_response(e.code)
            self.send_cors_headers()
            self.end_headers()
            if e.fp:
                error_content = e.read()
                logger.debug(f"Error content: {error_content.decode('utf-8', errors='replace')}")
                self.wfile.write(error_content)
            else:
                error_msg = f"Error: {str(e)}".encode()
                self.wfile.write(error_msg)
        
        except socket.timeout:
            logger.error(f"Request to {target_url} timed out")
            self.send_response(504)  # Gateway Timeout
            self.send_cors_headers()
            self.end_headers()
            timeout_msg = f"Request to Ollama timed out. For large models, the first request may take longer.".encode()
            self.wfile.write(timeout_msg)
                
        except Exception as e:
            logger.error(f"Proxy error: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            self.send_response(502)  # Bad Gateway
            self.send_cors_headers()
            self.end_headers()
            error_msg = f"Proxy error: {str(e)}".encode()
            self.wfile.write(error_msg)

    def handle_quota_request(self):
        logger.info(f"Handling /quota request from {self.address_string()}")
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        
        response_data = json.dumps({"quota": 999})
        encoded_response_data = response_data.encode('utf-8')
        
        self.send_header("Content-Length", str(len(encoded_response_data)))
        self.end_headers()
        self.wfile.write(encoded_response_data)
        logger.debug(f"Sent /quota response: {response_data}")

    def handle_exec_request(self):
        """Execute a shell command inside the ollama_service container and stream output"""
        logger.info(f"Handling /exec request from {self.address_string()}")
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            original_command = params.get('cmd', [''])[0]

            if not original_command:
                self.send_response(400)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b"data: ERROR: No command provided\n\n")
                self.wfile.flush()
                return

            # Sanitize or validate original_command if necessary, though shell=True is risky
            # For ollama commands, it's relatively safe, but be very careful with arbitrary commands.
            # It's better to NOT use shell=True with docker exec if possible and pass command and args as a list.
            # However, to match your `ollama run model` example which might have spaces,
            # shell=True for the outer `docker exec` command string is easier for now.

            # Name of the ollama service container as defined in docker-compose.yml
            ollama_container_name = "ollama_service" # Or make this configurable

            # Construct the docker exec command
            # Using -i for interactive (needed for some commands to get output properly)
            # Using -t for pseudo-TTY is often used with -i but might complicate streaming simple line output.
            # Let's try without -t first for cleaner line-by-line streaming.
            # If `original_command` can have tricky characters, proper shell escaping would be needed
            # or pass command and args as a list to Popen if not using `shell=True` for `docker_exec_cmd_list`.
            
            # If original_command is simple like "ollama run modelname"
            # docker_exec_cmd_str = f"docker exec {ollama_container_name} {original_command}"

            # For commands with arguments, it's safer to pass them as a list to Popen
            # to avoid shell injection issues with `original_command` if `shell=True` for Popen.
            # But `docker exec` itself will parse `original_command`.
            # Let's try with `shell=True` for Popen for simplicity of the `docker exec` string.
            
            # IMPORTANT: Ensure 'original_command' is somewhat trustworthy or validated,
            # as it's being interpolated into a shell command.
            # For example, ensure it starts with "ollama"
            if not original_command.strip().startswith("ollama"):
                self.send_response(400)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b"data: ERROR: Only 'ollama' commands are allowed.\n\n") # Basic safety
                self.wfile.flush()
                return


            docker_exec_cmd_str = f"docker exec {ollama_container_name} {original_command}"
            logger.info(f"Executing in ollama container: {docker_exec_cmd_str}")


            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            # Using shell=True for the Popen call because docker_exec_cmd_str is a full string.
            # This is generally okay if docker_exec_cmd_str is constructed carefully.
            process = subprocess.Popen(
                docker_exec_cmd_str,
                shell=True, 
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Merge stderr to stdout
                text=True,
                bufsize=1, # Line buffered
                # `universal_newlines=True` is an alias for `text=True` in newer Python
            )

            for line in iter(process.stdout.readline, ''): # Read line by line
                data = line.rstrip() # Remove trailing newline
                logger.debug(f"Exec output line: {data}")
                try:
                    self.wfile.write(f"data: {data}\n\n".encode('utf-8'))
                    self.wfile.flush()
                except BrokenPipeError:
                    logger.warning("Client disconnected during exec stream.")
                    process.terminate() # or process.kill()
                    break
                except Exception as write_e:
                    logger.error(f"Error writing to client during exec stream: {write_e}")
                    process.terminate()
                    break
            
            process.stdout.close()
            return_code = process.wait()
            logger.info(f"Command '{original_command}' finished with exit code {return_code}")

            try:
                self.wfile.write(f"event: done\ndata: [COMMAND_FINISHED code={return_code}]\n\n".encode('utf-8'))
                self.wfile.flush()
            except Exception as final_write_e:
                logger.warning(f"Could not send [DONE] event: {final_write_e}")

        except Exception as e:
            logger.error(f"Error in handle_exec_request: {e}")
            # Try to send an error response if headers not already sent
            if not self.headers_sent:
                self.send_response(500)
                self.send_cors_headers()
                self.end_headers()
            try:
                # Ensure it's a valid SSE message even for errors
                error_message_for_sse = str(e).replace('\n', ' ') # SSE data should be single line
                self.wfile.write(f"data: ERROR: {error_message_for_sse}\n\n".encode('utf-8'))
                self.wfile.flush()
                # Send a done event after error too if you want the EventSource to close
                self.wfile.write(b"event: done\ndata: [ERROR_OCCURRED]\n\n")
                self.wfile.flush()
            except Exception as final_error_write_e:
                logger.error(f"Could not write error to client: {final_error_write_e}")

    def handle_favicon_request(self):
        logger.debug(f"Handling /favicon.ico request from {self.address_string()}")
        self.send_response(204) # No Content is often used for favicon if you don't have one
        self.send_cors_headers() # May not be strictly necessary for favicon by browsers
        self.end_headers()
        logger.debug(f"Sent 204 No Content for /favicon.ico")

def check_ollama_running():
    """Check if Ollama is already running"""
    # OLLAMA_BASE_URL should be accessible here (it's a global in this module now)
    try:
        logger.debug(f"Checking if Ollama server is running at {OLLAMA_BASE_URL}/api/version ...")
        with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/version", timeout=2) as response:
            if response.status == 200:
                version = response.read().decode('utf-8')
                logger.info(f"Ollama server is running: {version}")
                return True
    except Exception as e:
        logger.info(f"Ollama server is not running at {OLLAMA_BASE_URL}: {str(e)}") # Log which URL failed
        return False

def start_ollama_server():
    """Start Ollama server as a subprocess and capture its logs"""
    try:
        logger.info("Starting Ollama server...")
        process = subprocess.Popen(
            ["ollama", "serve"], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        # Start a thread to read and display Ollama logs
        def read_logs():
            logger.debug("Starting Ollama log reader thread")
            for line in process.stdout:
                logger.info(f"[Ollama] {line.strip()}")
        
        log_thread = threading.Thread(target=read_logs, daemon=True)
        log_thread.start()
        
        # Wait for Ollama to start
        for attempt in range(1, 11):
            logger.info(f"Waiting for Ollama to start (attempt {attempt}/10)...")
            if check_ollama_running():
                logger.info("Ollama server is running")
                return process
            time.sleep(1)
        
        logger.warning("Ollama did not start within expected time. Continuing anyway...")
        return process
    except FileNotFoundError:
        logger.error("Ollama executable not found. Please install Ollama first.")
        sys.exit(1)
