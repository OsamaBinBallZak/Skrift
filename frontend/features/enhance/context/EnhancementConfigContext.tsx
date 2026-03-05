import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { apiService } from '../../../src/api';

// Enhancement option configuration
export interface EnhancementOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  systemPrompt: string;
}

// Full enhancement configuration
interface EnhancementConfig {
  enabled: boolean;
  defaultOption: string;
  options: EnhancementOption[];
  // Basic enhancement settings
  summaryLength: 'short' | 'medium' | 'long';
  includeKeywords: boolean;
  includeTopics: boolean;
  includeSentiment: boolean;
  includeActionItems: boolean;
  includeQuestions: boolean;
  
  // Speaker settings for conversation mode
  speakerDefaults: {
    defaultNames: string[];
    autoDetectSpeakers: boolean;
  };
}

interface EnhancementConfigContextType {
  config: EnhancementConfig;
  updateConfig: (updates: Partial<EnhancementConfig>) => void;
  updateOption: (optionId: string, updates: EnhancementOption) => void;
  resetToDefaults: () => void;
}

const defaultConfig: EnhancementConfig = {
  enabled: true,
  defaultOption: 'copy-edit',
  options: [
    {
      id: 'title',
      name: 'Generate Title',
      description: 'AI analyzes transcript to extract or generate a title',
      icon: 'FileText',
      color: 'indigo',
      systemPrompt: 'Analyze the following transcript. If the speaker explicitly mentions a title or name for this content, extract and return that exact title. If no title is mentioned, generate an appropriate, concise title (5-10 words) that captures the main topic. Return ONLY the title, nothing else.'
    },
    {
      id: 'copy-edit',
      name: 'Copy Edit (Fix Spelling/Grammar)',
      description: 'Rewrite to correct spelling, grammar, and readability while preserving meaning. Output only the corrected text.',
      icon: 'FileText',
      color: 'blue',
      systemPrompt: 'You are an expert copy editor. Task: rewrite the text to fix spelling, grammar, and readability while strictly preserving meaning and technical detail.\\n\\nRules:\\n- Preserve any occurrences of [[like this]] exactly as-is. Do not remove the double brackets or alter the inner text.\\n- Do not add explanations, headings, or preambles.\\n- Do not summarize; keep roughly the same length unless removing filler or repetition.\\n- Use clear, natural English.\\n- Output only the corrected text, nothing else.'
    },
    {
      id: 'summary',
      name: 'Summary (1 sentence)',
      description: 'Return exactly one sentence (20–30 words) summarizing the text.',
      icon: 'FileText',
      color: 'red',
      systemPrompt: 'Return exactly one sentence (20-30 words) summarizing the text.'
    },
    {
      id: 'keywords',
      name: 'Keywords / Tags',
      description: 'Select up to 10 tags from the whitelist.',
      icon: 'Zap',
      color: 'green',
      systemPrompt: ''
    }
  ],
  summaryLength: 'medium',
  includeKeywords: true,
  includeTopics: true,
  includeSentiment: false,
  includeActionItems: true,
  includeQuestions: false,
  speakerDefaults: {
    defaultNames: ['Speaker 1', 'Speaker 2'],
    autoDetectSpeakers: true
  }
};

const EnhancementConfigContext = createContext<EnhancementConfigContextType | undefined>(undefined);

export function EnhancementConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EnhancementConfig>(defaultConfig);

  // On mount, pull persisted prompts from backend settings and patch into config
  useEffect(() => {
    (async () => {
      try {
        const cfg = await apiService.getConfig();
        const persistedTitle = cfg?.enhancement?.prompts?.title;
        const persistedCopy = cfg?.enhancement?.prompts?.copy_edit;
        const persistedSummary = cfg?.enhancement?.prompts?.summary;
        if (persistedTitle || persistedCopy || persistedSummary) {
          setConfig(prev => ({
            ...prev,
            options: prev.options.map(o => {
              if (o.id === 'title' && persistedTitle) return { ...o, systemPrompt: String(persistedTitle) };
              if (o.id === 'copy-edit' && persistedCopy) return { ...o, systemPrompt: String(persistedCopy) };
              if (o.id === 'summary' && persistedSummary) return { ...o, systemPrompt: String(persistedSummary) };
              return o;
            })
          }));
        }
      } catch (e) {
        console.warn('Failed to load enhancement prompts from backend, using defaults', e);
      }
    })();
  }, []);

  const updateConfig = (updates: Partial<EnhancementConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    console.log('Enhancement config updated:', updates);
    // Backend API call to save config will go here
  };

  const updateOption = (optionId: string, updates: EnhancementOption) => {
    setConfig(prev => ({
      ...prev,
      options: prev.options.map(option => 
        option.id === optionId ? updates : option
      )
    }));
    console.log('Enhancement option updated:', optionId, updates);
    // Persist prompt changes for known options
    try {
      if (optionId === 'title') {
        apiService.updateConfig('enhancement.prompts.title', updates.systemPrompt);
      } else if (optionId === 'summary') {
        apiService.updateConfig('enhancement.prompts.summary', updates.systemPrompt);
      } else if (optionId === 'copy-edit') {
        apiService.updateConfig('enhancement.prompts.copy_edit', updates.systemPrompt);
      }
    } catch (e) {
      console.warn('Failed to persist prompt change:', e);
    }
  };

  const resetToDefaults = () => {
    setConfig(defaultConfig);
    console.log('Enhancement config reset to defaults');
    // Backend API call to reset config will go here
  };

  return (
    <EnhancementConfigContext.Provider value={{ config, updateConfig, updateOption, resetToDefaults }}>
      {children}
    </EnhancementConfigContext.Provider>
  );
}

export function useEnhancementConfig() {
  const context = useContext(EnhancementConfigContext);
  if (!context) {
    // Graceful degradation - return default config if context is not available
    console.warn('EnhancementConfigContext not found, using default config');
    return {
      config: defaultConfig,
      updateConfig: () => {
        console.log('Enhancement config update called but context not available');
      },
      updateOption: () => {
        console.log('Enhancement option update called but context not available');
      },
      resetToDefaults: () => {
        console.log('Enhancement config reset called but context not available');
      }
    };
  }
  return context;
}