// src/utils/transcriptionModelManager.ts

import { pipeline, env } from '@xenova/transformers';
import { AVAILABLE_MODELS, TranscriptionModel } from '../config/transcription-models';
import { SensorSettings, ModelStatus } from './settings';
import { Logger } from './logging';

// This combines the static model info with its dynamic status
export interface CombinedTranscriptionModel extends TranscriptionModel {
    status: ModelStatus;
}

class Manager {
    /**
     * Gets the full object for the currently active model.
     * Falls back to the first available model if the saved one is invalid.
     */
    public getActiveModel(): TranscriptionModel {
        const activeId = SensorSettings.getActiveModelId();
        const model = AVAILABLE_MODELS.find(m => m.id === activeId);

        if (model) {
            return model;
        }

        return AVAILABLE_MODELS[0];
    }

    /**
     * Gets a list of all available models, combined with their current download status.
     * This is perfect for driving a settings UI.
     */
    public getCombinedModels(): CombinedTranscriptionModel[] {
        const statuses = SensorSettings.getModelStatuses();
        return AVAILABLE_MODELS.map(model => ({
            ...model,
            status: statuses[model.id] || 'not_downloaded',
        }));
    }

    /**
     * Sets a new model as the active one.
     */
    public setActiveModel(modelId: string): void {
        const modelExists = AVAILABLE_MODELS.some(m => m.id === modelId);
        if (modelExists) {
            SensorSettings.setActiveModelId(modelId);
            Logger.info('MODEL_MANAGER', `Set active transcription model to: ${modelId}`);
        } else {
            Logger.error('MODEL_MANAGER', `Attempted to set invalid model ID: ${modelId}`);
        }
    }

    /**
     * Initiates the download of a model by creating a pipeline.
     * Updates the status in settings throughout the process.
     */
    public async downloadModel(modelId: string, progressCallback?: (data: any) => void): Promise<boolean> {
        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) {
            Logger.error('MODEL_MANAGER', `Cannot download invalid model ID: ${modelId}`);
            return false;
        }

        const statuses = SensorSettings.getModelStatuses();
        if (statuses[modelId] === 'downloaded') {
            Logger.info('MODEL_MANAGER', `Model "${modelId}" is already downloaded`);
            return true;
        }
        
        // This is the "trick" to make Transformers.js cache the model locally.
        try {
            this.updateStatus(modelId, 'downloading');
            Logger.info('MODEL_MANAGER', `Downloading model: ${modelId}...`);

            // Configure pipeline to use local caching
            env.allowLocalModels = SensorSettings.getAllowLocalModelCaching();

            // Create a dummy pipeline to trigger the download.
            // The progress_callback will forward status to the UI.
            await pipeline('automatic-speech-recognition', modelId, { 
                progress_callback: progressCallback 
            });

            this.updateStatus(modelId, 'downloaded');
            Logger.info('MODEL_MANAGER', `Successfully downloaded ${modelId}.`);
            return true;
        } catch (error) {
            this.updateStatus(modelId, 'error');
            Logger.error('MODEL_MANAGER', `Failed to download model ${modelId}:, error`);
            return false;
        }
    }
    
    private updateStatus(modelId: string, status: ModelStatus): void {
        const statuses = SensorSettings.getModelStatuses();
        statuses[modelId] = status;
        SensorSettings.setModelStatuses(statuses);
    }
}

// Export a single instance for the entire application to use
export const TranscriptionModelManager = new Manager();
