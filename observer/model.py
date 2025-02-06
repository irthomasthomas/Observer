# model.py
import requests
import json

class Model:
    def __init__(self, model_name="deepseek-r1:8b", host="10.0.0.72", port="11434"):
        self.model = model_name
        self.api_url = f"http://{host}:{port}/api/generate"
        print(f"Initialized model: {model_name}")
    
    def generate(self, prompt, stream=True):
        """Generate response using Ollama with optional streaming"""

        data = {
            "model": self.model,
            "prompt": prompt,
            "stream": stream
        }
        
        try:
            if stream:
                return self._handle_stream(data)
            return self._handle_single(data)
        except Exception as e:
            print(f"Generation error: {e}")
            raise
    
    def _handle_stream(self, data):
        """Handle streaming response"""
        response = requests.post(self.api_url, json=data, stream=True)
        if response.status_code != 200:
            raise Exception(f"API error: {response.text}")
            
        full_response = []
        for line in response.iter_lines():
            if line:
                json_response = json.loads(line)
                if json_response.get("response"):
                    chunk = json_response["response"]
                    full_response.append(chunk)
                    print(chunk, end="", flush=True)
                if json_response.get("done"):
                    print()  # New line at end
                    break
        
        return "".join(full_response)
    
    def _handle_single(self, data):
        """Handle single response"""
        response = requests.post(self.api_url, json=data)
        if response.status_code != 200:
            raise Exception(f"API error: {response.text}")
        
        return response.json()["response"]
