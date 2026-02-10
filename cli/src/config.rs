use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub discord: DiscordConfig,
    #[serde(default)]
    pub telegram: TelegramConfig,
    #[serde(default)]
    pub phone: PhoneConfig,
    #[serde(default)]
    pub email: EmailConfig,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct DiscordConfig {
    pub webhook_url: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TelegramConfig {
    pub chat_id: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct PhoneConfig {
    pub number: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct EmailConfig {
    pub address: Option<String>,
}

impl Config {
    /// Get the config directory path (~/.config/observe/)
    fn config_dir() -> Option<PathBuf> {
        dirs::config_dir().map(|p| p.join("observe"))
    }

    /// Get the config file path
    fn config_path() -> Option<PathBuf> {
        Self::config_dir().map(|p| p.join("config.toml"))
    }

    /// Load config from file, or return default if not found
    pub fn load() -> Self {
        let Some(path) = Self::config_path() else {
            return Self::default();
        };

        match fs::read_to_string(&path) {
            Ok(contents) => toml::from_str(&contents).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Save config to file
    pub fn save(&self) -> io::Result<()> {
        let Some(dir) = Self::config_dir() else {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "Could not determine config directory",
            ));
        };

        fs::create_dir_all(&dir)?;

        let path = dir.join("config.toml");
        let contents = toml::to_string_pretty(self)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        fs::write(path, contents)
    }

    /// Get Discord webhook URL, prompting if not configured
    pub fn get_or_prompt_webhook(&mut self) -> io::Result<String> {
        if let Some(ref url) = self.discord.webhook_url {
            return Ok(url.clone());
        }

        // Prompt on stderr so it doesn't interfere with command output
        eprintln!("No Discord webhook configured.");
        eprintln!("Create one in Discord: Server Settings > Integrations > Webhooks");
        eprint!("Enter Discord webhook URL: ");
        io::stderr().flush()?;

        // Read from stdin
        let stdin = io::stdin();
        let mut line = String::new();
        stdin.lock().read_line(&mut line)?;

        let url = line.trim().to_string();

        if url.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Webhook URL cannot be empty",
            ));
        }

        // Validate it looks like a Discord webhook URL
        if !url.starts_with("https://discord.com/api/webhooks/")
            && !url.starts_with("https://discordapp.com/api/webhooks/")
        {
            eprintln!("Warning: URL doesn't look like a Discord webhook, but proceeding anyway.");
        }

        // Save it
        self.discord.webhook_url = Some(url.clone());
        self.save()?;

        eprintln!("Webhook saved to ~/.config/observe/config.toml");
        Ok(url)
    }

    /// Get Telegram chat ID, prompting if not configured
    pub fn get_or_prompt_telegram(&mut self) -> io::Result<String> {
        if let Some(ref chat_id) = self.telegram.chat_id {
            return Ok(chat_id.clone());
        }

        // Prompt on stderr
        eprintln!("No Telegram chat ID configured.");
        eprintln!("Message @observer_ai_bot on Telegram to get your chat ID.");
        eprint!("Enter Telegram chat ID: ");
        io::stderr().flush()?;

        let stdin = io::stdin();
        let mut line = String::new();
        stdin.lock().read_line(&mut line)?;

        let chat_id = line.trim().to_string();

        if chat_id.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Chat ID cannot be empty",
            ));
        }

        // Save it
        self.telegram.chat_id = Some(chat_id.clone());
        self.save()?;

        eprintln!("Telegram chat ID saved to ~/.config/observe/config.toml");
        Ok(chat_id)
    }

    /// Get phone number, prompting if not configured
    pub fn get_or_prompt_phone(&mut self) -> io::Result<String> {
        if let Some(ref number) = self.phone.number {
            return Ok(number.clone());
        }

        eprintln!("No phone number configured.");
        eprintln!("Note: You must whitelist your number first by messaging the Observer bot.");
        eprint!("Enter phone number (E.164 format, e.g. +15551234567): ");
        io::stderr().flush()?;

        let stdin = io::stdin();
        let mut line = String::new();
        stdin.lock().read_line(&mut line)?;

        let number = line.trim().to_string();

        if number.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Phone number cannot be empty",
            ));
        }

        self.phone.number = Some(number.clone());
        self.save()?;

        eprintln!("Phone number saved to ~/.config/observe/config.toml");
        Ok(number)
    }

    /// Get email address, prompting if not configured
    pub fn get_or_prompt_email(&mut self) -> io::Result<String> {
        if let Some(ref address) = self.email.address {
            return Ok(address.clone());
        }

        eprintln!("No email address configured.");
        eprint!("Enter email address: ");
        io::stderr().flush()?;

        let stdin = io::stdin();
        let mut line = String::new();
        stdin.lock().read_line(&mut line)?;

        let address = line.trim().to_string();

        if address.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Email address cannot be empty",
            ));
        }

        self.email.address = Some(address.clone());
        self.save()?;

        eprintln!("Email address saved to ~/.config/observe/config.toml");
        Ok(address)
    }
}
