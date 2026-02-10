mod auth;
mod config;
mod notify;
mod runner;

use clap::{Parser, Subcommand};
use config::Config;

#[derive(Parser)]
#[command(name = "observe")]
#[command(about = "Wrap commands and get notified when they complete")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Send notification via Telegram (requires login)
    #[arg(long)]
    telegram: bool,

    /// Send notification via SMS (requires login + whitelisted number)
    #[arg(long)]
    sms: bool,

    /// Send notification via WhatsApp (requires login + whitelisted number)
    #[arg(long)]
    whatsapp: bool,

    /// Send notification via voice call (requires login + whitelisted number)
    #[arg(long)]
    call: bool,

    /// Send notification via email (requires login)
    #[arg(long)]
    email: bool,

    /// The command to run (and its arguments)
    #[arg(trailing_var_arg = true)]
    args: Vec<String>,
}

#[derive(Subcommand)]
enum Commands {
    /// Login to Observer AI (required for Telegram, SMS, WhatsApp, Call, Email)
    Login,
    /// Logout from Observer AI
    Logout,
    /// Show current auth status
    Whoami,
}

enum NotifyChannel {
    Discord,
    Telegram,
    Sms,
    WhatsApp,
    Call,
    Email,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    // Handle subcommands
    if let Some(cmd) = cli.command {
        match cmd {
            Commands::Login => {
                if let Err(e) = auth::login().await {
                    eprintln!("Login failed: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            Commands::Logout => {
                if let Err(e) = auth::logout() {
                    eprintln!("Logout failed: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            Commands::Whoami => {
                auth::whoami();
                return;
            }
        }
    }

    // No subcommand - run a command and notify
    if cli.args.is_empty() {
        eprintln!("Usage: observe [OPTIONS] <COMMAND>...");
        eprintln!("       observe login");
        eprintln!("       observe logout");
        eprintln!("       observe whoami");
        eprintln!();
        eprintln!("Options:");
        eprintln!("       --telegram    Send via Telegram (requires login)");
        eprintln!("       --sms         Send via SMS (requires login)");
        eprintln!("       --whatsapp    Send via WhatsApp (requires login)");
        eprintln!("       --call        Send via voice call (requires login)");
        eprintln!("       --email       Send via email (requires login)");
        eprintln!();
        eprintln!("Default: Discord webhook (no login required)");
        eprintln!();
        eprintln!("Run 'observe --help' for more information.");
        std::process::exit(1);
    }

    // Determine notification channel
    let channel = if cli.telegram {
        NotifyChannel::Telegram
    } else if cli.sms {
        NotifyChannel::Sms
    } else if cli.whatsapp {
        NotifyChannel::WhatsApp
    } else if cli.call {
        NotifyChannel::Call
    } else if cli.email {
        NotifyChannel::Email
    } else {
        NotifyChannel::Discord
    };

    // Load config
    let mut config = Config::load();

    // Format command for display
    let command_str = cli.args.join(" ");

    // Run the command first
    let result = match runner::run_command(&cli.args) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to run command: {}", e);
            std::process::exit(1);
        }
    };

    // Send notification based on channel
    match channel {
        NotifyChannel::Discord => {
            let webhook_url = match config.get_or_prompt_webhook() {
                Ok(url) => url,
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            };

            if let Err(e) = notify::send_discord_notification(&webhook_url, &command_str, &result).await {
                eprintln!("Failed to send Discord notification: {}", e);
            }
        }
        NotifyChannel::Telegram => {
            let (access_token, chat_id) = get_auth_and_config(
                &mut config,
                |c| c.get_or_prompt_telegram(),
            ).await;

            if let Err(e) = notify::send_telegram_notification(&chat_id, &command_str, &result, &access_token).await {
                eprintln!("Failed to send Telegram notification: {}", e);
            }
        }
        NotifyChannel::Sms => {
            let (access_token, phone) = get_auth_and_config(
                &mut config,
                |c| c.get_or_prompt_phone(),
            ).await;

            if let Err(e) = notify::send_sms_notification(&phone, &command_str, &result, &access_token).await {
                eprintln!("Failed to send SMS notification: {}", e);
            }
        }
        NotifyChannel::WhatsApp => {
            let (access_token, phone) = get_auth_and_config(
                &mut config,
                |c| c.get_or_prompt_phone(),
            ).await;

            if let Err(e) = notify::send_whatsapp_notification(&phone, &command_str, &result, &access_token).await {
                eprintln!("Failed to send WhatsApp notification: {}", e);
            }
        }
        NotifyChannel::Call => {
            let (access_token, phone) = get_auth_and_config(
                &mut config,
                |c| c.get_or_prompt_phone(),
            ).await;

            if let Err(e) = notify::send_call_notification(&phone, &command_str, &result, &access_token).await {
                eprintln!("Failed to send call notification: {}", e);
            }
        }
        NotifyChannel::Email => {
            let (access_token, email) = get_auth_and_config(
                &mut config,
                |c| c.get_or_prompt_email(),
            ).await;

            if let Err(e) = notify::send_email_notification(&email, &command_str, &result, &access_token).await {
                eprintln!("Failed to send email notification: {}", e);
            }
        }
    }

    // Exit with the same code as the wrapped command
    std::process::exit(result.exit_code.unwrap_or(1));
}

/// Helper to get auth token and a config value for API-backed channels
async fn get_auth_and_config<F>(config: &mut Config, get_config: F) -> (String, String)
where
    F: FnOnce(&mut Config) -> std::io::Result<String>,
{
    // Get auth token
    let mut tokens = match auth::AuthTokens::load() {
        Some(t) => t,
        None => {
            eprintln!("Not logged in. Run 'observe login' first.");
            std::process::exit(1);
        }
    };

    let access_token = match tokens.get_valid_token().await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("Auth error: {}", e);
            std::process::exit(1);
        }
    };

    // Get config value
    let config_value = match get_config(config) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    };

    (access_token, config_value)
}
