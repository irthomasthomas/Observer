import React, { useState } from 'react';
import { Github, Terminal, Shield, Cpu, Box, ChevronRight, ArrowRight, Code, Clock, Brain } from 'lucide-react';
import ObserverLanding from './ObserverLanding';

const LandingPage = () => {
  const [activeAgent, setActiveAgent] = useState(0);
  
  const agents = [
    {
      name: "Activity Tracking Agent",
      description: "Tracks your activity across applications to help you understand how you spend your time.",
      icon: <Box className="w-6 h-6" />,
      time: "15s",
      model: "deepseek-r1:8b"
    },
    {
      name: "Command Tracking Agent",
      description: "Monitors and logs command-line operations for easy reference and automation.",
      icon: <Terminal className="w-6 h-6" />,
      time: "30s",
      model: "deepseek-r1:8b"
    },
    {
      name: "Code Documentation Agent",
      description: "Watches your screen and if there is code, it will document code in the background.",
      icon: <Code className="w-6 h-6" />,
      time: "60s",
      model: "deepseek-r1:8b"
    },
    {
      name: "Focus Tracking Assistant",
      description: "Compiles a list of time used in certain applications to help improve productivity.",
      icon: <Clock className="w-6 h-6" />,
      time: "60s",
      model: "deepseek-r1:8b"
    },
    {
      name: "Memory Summarization Agent",
      description: "Reads another agent's memories and summarizes them so context window length doesn't become a problem.",
      icon: <Brain className="w-6 h-6" />,
      time: "300s",
      model: "deepseek-r1:8b"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <header className="bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-6 -ml-1">
            <img src="/eye-logo-white.svg" alt="Observer AI Logo" className="w-6 h-6" />
            <span className="text-xl font-bold font-golos hidden md:inline">Observer AI</span>
          </div>
          <div className="flex items-center space-x-7 md:space-x-9 -mr-2">
            <a href="https://app.observer-ai.com" className="hover:text-gray-300 hidden md:inline">Features</a>
            <a href="#agents" className="hover:text-gray-300 hidden md:inline">Agents</a>
            <a href="https://github.com/Roy3838/Observer" className="hover:text-gray-300 hidden md:inline">Community</a>
            <a href="https://github.com/Roy3838/Observer" className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition">
              <Github className="w-5 h-5" />
              <span className="hidden md:inline">GitHub</span>
            </a>
          </div>
        </nav>

        <ObserverLanding />
        
        <div className="container mx-auto px-6 py-24 max-w-4xl">
          <h1 className="text-5xl font-bold mb-6">Your Personal AI Assistant, Running Locally</h1>
          <p className="text-xl text-gray-300 mb-8">
            Open-source micro-agents that observe and assist with your computing tasks, 
            all while keeping your data private and secure.
          </p>
          <div className="flex space-x-4">
            <a href="https://app.observer-ai.com" className="bg-white text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition flex items-center space-x-2">
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href="https://github.com/Roy3838/Observer" className="bg-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-600 transition">
              Documentation
            </a>
          </div>
        </div>
      </header>
      
      {/* Features Section */}
      <section className="py-20 bg-white" id="features">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-16">Why Observer AI?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-gray-700" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Privacy First</h3>
              <p className="text-gray-600">
                All processing happens locally on your machine. Your data never leaves your computer.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Cpu className="w-8 h-8 text-gray-700" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Resource Efficient</h3>
              <p className="text-gray-600">
                Runs efficiently on consumer-grade machines with the deepseek-r1:8b model.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Box className="w-8 h-8 text-gray-700" />
              </div>
              <h3 className="text-xl font-semibold mb-4">Extensible</h3>
              <p className="text-gray-600">
                Create and share your own agents with the community. Easy to customize and extend.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Agent Marketplace */}
      <section className="py-20 bg-gray-50" id="agents">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Available Agents</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Observer AI comes with a collection of useful agents to enhance your workflow.
              Each agent is designed for a specific purpose, running efficiently on your local machine.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {agents.map((agent, index) => (
              <div key={index} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition">
                <div className="flex items-center space-x-3 mb-4">
                  {agent.icon}
                  <h3 className="text-lg font-semibold">{agent.name}</h3>
                </div>
                <p className="text-gray-600 text-sm">
                  {agent.description}
                </p>
              </div>
            ))}

            {/* Coming Soon Placeholder */}
            <div className="bg-gray-100 p-6 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500">
              <span className="text-lg font-semibold mb-2">Coming Soon...</span>
              <p className="text-sm text-center">Create your own custom agent</p>
            </div>
          </div>

          <div className="text-center mt-12">
            <a href="https://app.observer-ai.com" className="inline-flex items-center space-x-2 bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition">
              <span>Create Your Own Agent</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section className="py-20 bg-gray-50" id="community">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-6">Join the Community</h2>
          <p className="text-gray-600 max-w-2xl mx-auto mb-12">
            Observer AI is built by the community, for the community. Create and share your own agents,
            contribute to the core framework, or help others get started.
          </p>
          <div className="flex justify-center space-x-4">
            <a href="https://github.com/Roy3838/Observer" className="bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition flex items-center space-x-2">
              <Github className="w-5 h-5" />
              <span>View on GitHub</span>
            </a>
            <a href="#discord" className="bg-gray-100 text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition">
              Join Discord
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <img src="/eye-logo-white.svg" alt="Observer AI Logo" className="w-6 h-6" />
              <span className="text-lg font-bold">Observer AI</span>
            </div>
            <div className="flex space-x-8">
              <a href="#privacy" className="text-gray-400 hover:text-white">Privacy</a>
              <a href="#terms" className="text-gray-400 hover:text-white">Terms</a>
              <a href="#contact" className="text-gray-400 hover:text-white">Contact</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>© 2025 Observer AI. Open source and community driven.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
