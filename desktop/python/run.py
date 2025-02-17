# run.py
from agents.timestamp_agent.agent import TimestampAgent
import sys

def main():
    print("Starting Timestamp Agent...")
    print("Press Ctrl+C to stop")
    print("-" * 50)
    
    try:
        agent = TimestampAgent(agent_model = "deepseek-r1:8b", host="10.0.0.72")
        agent.start()
    except KeyboardInterrupt:
        print("\nStopping agent gracefully...")
        try:
            agent.stop()
            print("Agent stopped successfully")
        except Exception as e:
            print(f"Error while stopping: {e}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

