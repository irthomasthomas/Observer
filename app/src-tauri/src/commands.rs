// In src-tauri/src/commands.rs

use axum::{extract::State as AxumState, http::StatusCode, response::Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{Manager, State};
use crate::{AppState, CommandState, AgentDiscoveryState, AgentInfo};

#[derive(Serialize, Deserialize)]
pub struct CommandsResponse {
    commands: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct CommandsRequest {
    completed: Vec<String>,
}

/// GET /commands - Returns pending commands and clears completed ones
pub async fn get_commands_handler(
    AxumState(state): AxumState<AppState>,
) -> Result<Json<CommandsResponse>, StatusCode> {
    log::info!("GET /commands - fetching pending commands");

    let command_state = state.app_handle.state::<CommandState>();
    let commands = command_state.pending_commands.lock().unwrap().clone();
    
    log::info!("Returning {} pending commands", commands.len());
    
    Ok(Json(CommandsResponse { commands }))
}

/// POST /commands - Marks commands as completed (removes them from pending state)
pub async fn post_commands_handler(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<CommandsRequest>,
) -> StatusCode {
    log::info!("POST /commands - marking {} commands as completed", payload.completed.len());

    let command_state = state.app_handle.state::<CommandState>();
    let mut commands = command_state.pending_commands.lock().unwrap();
    
    for agent_id in payload.completed {
        commands.remove(&agent_id);
        log::info!("Removed completed command for agent: {}", agent_id);
    }
    
    StatusCode::OK
}

/// Internal function to add a toggle command (called by shortcut system)
pub fn add_toggle_command(command_state: &CommandState, agent_id: String) {
    log::info!("Adding toggle command for agent '{}'", agent_id);
    let mut commands = command_state.pending_commands.lock().unwrap();
    commands.insert(agent_id, "toggle".to_string());
}

#[derive(Serialize)]
pub struct AgentsResponse {
    agents: Vec<AgentInfo>,
}

#[derive(Deserialize)]
pub struct UpdateAgentsRequest {
    agents: Vec<AgentInfo>,
}

/// GET /agents - Returns discovered agents from browser
pub async fn get_agents_handler(
    AxumState(state): AxumState<AppState>,
) -> Result<Json<AgentsResponse>, StatusCode> {
    log::info!("GET /agents - fetching available agents");

    let agent_state = state.app_handle.state::<AgentDiscoveryState>();
    let agents = agent_state.available_agents.lock().unwrap().clone();
    
    log::info!("Returning {} available agents", agents.len());
    
    Ok(Json(AgentsResponse { agents }))
}

/// POST /agents - Updates the list of available agents from browser
pub async fn update_agents_handler(
    AxumState(state): AxumState<AppState>,
    Json(payload): Json<UpdateAgentsRequest>,
) -> StatusCode {
    log::info!("POST /agents - updating agent list with {} agents", payload.agents.len());

    let agent_state = state.app_handle.state::<AgentDiscoveryState>();
    let mut agents = agent_state.available_agents.lock().unwrap();
    *agents = payload.agents;
    
    StatusCode::OK
}