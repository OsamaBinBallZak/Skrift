/**
 * API service for communicating with the FastAPI backend
 * Handles all HTTP requests to http://localhost:8000
 */

import type { PipelineFile } from './types/pipeline';

export const API_BASE_URL = 'http://localhost:8000';

export interface SystemResources {
  cpuUsage: number;
  ramUsed: number;
  ramTotal: number;
  coreTemp?: number;
  diskUsed?: number;
}

export interface SystemStatus {
  processing: boolean;
  currentFile?: string;
  currentStep?: string;
  queueLength: number;
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Health and system endpoints
  async checkHealth() {
    return this.request('/health');
  }

  async getSystemResources(): Promise<SystemResources> {
    return this.request('/api/system/resources');
  }

  async getSystemStatus(): Promise<SystemStatus> {
    return this.request('/api/system/status');
  }

  // File management
  async getFiles(): Promise<PipelineFile[]> {
    return this.request('/api/files/');
  }

  async getFile(fileId: string): Promise<PipelineFile> {
    return this.request(`/api/files/${fileId}`);
  }

  async uploadFiles(files: FileList, conversationMode: boolean = false): Promise<{success: boolean, files: PipelineFile[], message?: string}> {
    const formData = new FormData();
    
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('conversationMode', conversationMode.toString());

    return this.request('/api/files/upload', {
      method: 'POST',
      body: formData,
      headers: {}, // Let the browser set Content-Type for FormData
    });
  }

  async deleteFile(fileId: string): Promise<{success: boolean, message: string}> {
    return this.request(`/api/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  // Processing endpoints
  async startTranscription(fileId: string, conversationMode: boolean = false): Promise<{status: string, message: string}> {
    return this.request(`/api/process/transcribe/${fileId}`, {
      method: 'POST',
      body: JSON.stringify({ conversationMode }),
    });
  }

  async startSanitise(fileId: string): Promise<any> {
    // Custom fetch to allow 409 needs_disambiguation flow
    const url = `${API_BASE_URL}/api/process/sanitise/${fileId}`;
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (resp.status === 409) {
      const data = await resp.json().catch(() => ({}));
      return data; // { status: 'needs_disambiguation', session_id, occurrences, policy }
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  async cancelSanitise(fileId: string): Promise<{success: boolean}> {
    const url = `${API_BASE_URL}/api/files/${fileId}/sanitise/cancel`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  async resolveSanitise(fileId: string, payload: { session_id: string; decisions: { alias: string; offset?: number; person_id: string; apply_to_remaining?: boolean }[] }): Promise<any> {
    const url = `${API_BASE_URL}/api/process/sanitise/${fileId}/resolve`;
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  async startEnhancement(fileId: string, enhancementType: string = 'smart', prompt?: string): Promise<{status: string, message: string}> {
    return this.request(`/api/process/enhance/${fileId}`, {
      method: 'POST',
      body: JSON.stringify({ enhancementType, prompt }),
    });
  }

  async startExport(fileId: string, format: string = 'markdown'): Promise<{status: string, message: string}> {
    return this.request(`/api/process/export/${fileId}`, {
      method: 'POST',
      body: JSON.stringify({ exportFormat: format }),
    });
  }

  // Compiled markdown read/write
  async getCompiledMarkdown(fileId: string): Promise<{path: string; title?: string; content: string}> {
    return this.request(`/api/process/export/compiled/${fileId}`);
  }
  async saveCompiledMarkdown(fileId: string, content: string, export_to_vault: boolean = false, vault_path?: string): Promise<{success: boolean; path?: string; exported_path?: string; vault_exported_path?: string}> {
    return this.request(`/api/process/export/compiled/${fileId}`, { method: 'POST', body: JSON.stringify({ content, export_to_vault, vault_path }) });
  }

  // Enhancement model management (MLX)
  async listEnhanceModels(): Promise<{models: {name: string, path: string, size?: number, selected: boolean}[], selected?: string}> {
    return this.request('/api/process/enhance/models');
  }

  async uploadEnhanceModel(file: File): Promise<{success: boolean, path: string, name: string}> {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${API_BASE_URL}/api/process/enhance/models/upload`;
    const response = await fetch(url, { method: 'POST', body: formData });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async deleteEnhanceModel(filename: string): Promise<{success: boolean}> {
    return this.request(`/api/process/enhance/models/${filename}`, { method: 'DELETE' });
  }

  async selectEnhanceModel(path: string): Promise<{success: boolean, selected: string}> {
    const form = new URLSearchParams();
    form.set('path', path);
    const url = `${API_BASE_URL}/api/process/enhance/models/select`;
    const response = await fetch(url, { method: 'POST', body: form });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async testEnhanceModel(): Promise<{selected: string; elapsed_seconds: number; sample: string}> {
    return this.request(`/api/process/enhance/test`, { method: 'POST' });
  }

  // Enhancement pipeline setters
  async setEnhanceCopyedit(fileId: string, text: string): Promise<any> {
    return this.request(`/api/process/enhance/copyedit/${fileId}`, { method: 'POST', body: JSON.stringify({ text }) });
  }
  // Back-compat wrapper (can be removed later)
  async setEnhanceWorking(fileId: string, text: string): Promise<any> {
    return this.setEnhanceCopyedit(fileId, text);
  }
  async setEnhanceSummary(fileId: string, summary: string): Promise<any> {
    return this.request(`/api/process/enhance/summary/${fileId}`, { method: 'POST', body: JSON.stringify({ summary }) });
  }
  async setEnhanceTags(fileId: string, tags: string[]): Promise<any> {
    return this.request(`/api/process/enhance/tags/${fileId}`, { method: 'POST', body: JSON.stringify({ tags }) });
  }
  async generateEnhanceTags(fileId: string): Promise<{success: boolean; old: string[]; new: string[]; raw: string; whitelist_count?: number}> {
    return this.request(`/api/process/enhance/tags/generate/${fileId}`, { method: 'POST' });
  }
  async compileForObsidian(fileId: string): Promise<{success: boolean; compiled_path: string}> {
    return this.request(`/api/process/enhance/compile/${fileId}`, { method: 'POST' });
  }

  // Enhancement: Obsidian tag whitelist
  async getTagWhitelist(): Promise<{version: number; count: number; tags: string[]}> {
    return this.request('/api/process/enhance/tags/whitelist');
  }

  async refreshTagWhitelist(): Promise<{success: boolean; count: number; path: string; scanned_files: number}> {
    return this.request('/api/process/enhance/tags/whitelist/refresh', { method: 'POST' });
  }

  // Configuration
  async getConfig(): Promise<any> {
    const res = await this.request('/api/config/');
    // Unwrap ConfigResponse so callers can use config directly
    return (res && (res as any).config) ? (res as any).config : res;
  }

  async updateConfig(key: string, value: any): Promise<{success: boolean, message: string}> {
    return this.request('/api/config/update', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }

  async getInputFolder(): Promise<{path: string, exists: boolean, writable: boolean}> {
    return this.request('/api/config/folders/input');
  }

  async getOutputFolder(): Promise<{path: string, exists: boolean, writable: boolean}> {
    return this.request('/api/config/folders/output');
  }

  async setInputFolder(path: string): Promise<{success: boolean, message: string}> {
    return this.request('/api/config/folders/input', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  async setOutputFolder(path: string): Promise<{success: boolean, message: string}> {
    return this.request('/api/config/folders/output', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Utility function to check if backend is available
export async function checkBackendConnection(): Promise<boolean> {
  try {
    await apiService.checkHealth();
    return true;
  } catch (error) {
    console.warn('Backend not available:', error);
    return false;
  }
}
