# model.py
import requests

class Model:
    def __init__(self, model_name="deepseek-coder:6b"):
        self.model = model_name
        self.api_url = "http://localhost:11434/api/generate"
    
    def generate(self, prompt):
        """Generate response using Ollama"""
        data = {
            "model": self.model,
            "prompt": prompt,
            "stream": False
        }
        
        response = requests.post(self.api_url, json=data)
        if response.status_code == 200:
            return response.json()["response"]
        else:
            raise Exception(f"Error generating response: {response.text}")
