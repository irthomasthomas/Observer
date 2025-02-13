from datetime import datetime, timedelta
import json
from core.base_agent import BaseAgent

class TimeTrackingAgent(BaseAgent):
    def __init__(self, host="10.0.0.72"):
        super().__init__(agent_name="time_agent", host=host)
        
        # Initialize tracking files
        self.sessions_file = self.get_data_path("sessions.json")
        self.current_session = {
            "start_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "entries": []
        }
        
        # Track current application state
        self.current_app = "None"
        self.current_title = "None"
        self.last_switch_time = datetime.now()
        
        # Load or initialize session data
        self.load_session()

    def get_state_data(self):
        """Provide state data for prompt templating"""
        return {
            "last_app": self.current_app,
            "last_title": self.current_title
        }

    def load_session(self):
        """Load existing sessions or create new sessions file"""
        try:
            with open(self.sessions_file, 'r') as f:
                self.sessions = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            self.sessions = []
            self.save_session()

    def save_session(self):
        """Save sessions to file"""
        with open(self.sessions_file, 'w') as f:
            json.dump(self.sessions, f, indent=2)
        self.log(f"Saved session data with {len(self.current_session['entries'])} entries")

    def process_command(self, line):
        """Process commands from the model"""
        try:
            if ':' not in line:
                return
                
            command, params_str = line.split(':', 1)
            command = command.strip()
            params = [p.strip() for p in params_str.split('|')]
            
            if command == "APP_SWITCH" and len(params) == 2:
                app_name, window_title = params
                self.record_app_switch(app_name, window_title)
                
        except Exception as e:
            self.log(f"Error processing command: {e}")

    def record_app_switch(self, app_name, window_title):
        """Record an application switch"""
        current_time = datetime.now()
        
        # Only record if it's a different app or title
        if (app_name != self.current_app or 
            window_title != self.current_title):
            
            # Record duration for previous app
            duration = (current_time - self.last_switch_time).total_seconds()
            
            # Only record if duration is significant (>2 seconds)
            if duration > 2:
                entry = {
                    "app": self.current_app,
                    "title": self.current_title,
                    "start_time": self.last_switch_time.strftime("%Y-%m-%d %H:%M:%S"),
                    "duration_seconds": round(duration)
                }
                self.current_session["entries"].append(entry)
                self.log(f"Recorded {duration}s in {self.current_app}")
            
            # Update current state
            self.current_app = app_name
            self.current_title = window_title
            self.last_switch_time = current_time
            self.log(f"Switched to {app_name}: {window_title}")

    def cleanup(self):
        """Save final session data when stopping"""
        # Record final duration for last app
        if self.current_app != "None":
            self.record_app_switch("None", "None")  # Trigger final duration calculation
        
        # Add session to sessions list if it has entries
        if self.current_session["entries"]:
            self.current_session["end_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.sessions.append(self.current_session)
            self.save_session()
        
    def get_session_summary(self):
        """Get summary of current session"""
        if not self.current_session["entries"]:
            return "No activity recorded yet"
            
        app_durations = {}
        for entry in self.current_session["entries"]:
            app = entry["app"]
            duration = entry["duration_seconds"]
            app_durations[app] = app_durations.get(app, 0) + duration
            
        summary = []
        for app, total_seconds in app_durations.items():
            minutes = round(total_seconds / 60, 1)
            summary.append(f"{app}: {minutes} minutes")
            
        return "\n".join(summary)
