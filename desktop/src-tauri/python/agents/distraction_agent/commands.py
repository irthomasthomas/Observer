from core.commands import command
from datetime import datetime
from pathlib import Path

def ensure_activity_file(agent):
    """Ensure activity file exists and is ready for writing"""
    data_dir = agent.data_path
    activity_file = data_dir / "activities.txt"
    
    data_dir.mkdir(exist_ok=True)
    
    if not activity_file.exists():
        activity_file.touch()
    
    return activity_file


@command("ACTIVITY")
def handle_activity(agent, line):

  






  
    activity_file = ensure_activity_file(agent)
    
    timestamp = datetime.now().strftime("%I:%M%p").lower()
    with open(activity_file, "a") as f:
        f.write(f"{timestamp}: {line}\n")
