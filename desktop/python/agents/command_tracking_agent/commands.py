from core.commands import command
from datetime import datetime
from pathlib import Path

def get_command_file(agent):
    """Ensure command file exists and is ready for writing"""
    data_dir = agent.data_path
    command_file = data_dir / "commands.txt"
    
    data_dir.mkdir(exist_ok=True)
    
    if not command_file.exists():
        command_file.touch()
    
    return command_file

@command("COMMAND")
def handle_command(agent, line):
    """Handle the COMMAND command
    Records commands with timestamp"""
    command_file = get_command_file(agent)
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(command_file, "a") as f:
        f.write(f"[{timestamp}] {line}\n")
