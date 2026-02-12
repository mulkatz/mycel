import { z } from 'zod';

export const DomainBehaviorConfigSchema = z.object({
  schemaCreation: z.enum(['manual', 'web_research', 'hybrid']),
  schemaEvolution: z.enum(['fixed', 'suggest', 'auto']),
  webSearch: z.enum(['disabled', 'bootstrap_only', 'enrichment', 'full']),
  knowledgeValidation: z.enum(['trust_user', 'flag_conflicts', 'verify']),
  proactiveQuestioning: z.enum(['passive', 'gentle', 'active']),
  documentGeneration: z.enum(['disabled', 'manual', 'on_session_end', 'threshold']),
});

export type DomainBehaviorConfig = z.infer<typeof DomainBehaviorConfigSchema>;

export const BehaviorPresetSchema = z.enum(['manual', 'balanced', 'full_auto']);
export type BehaviorPreset = z.infer<typeof BehaviorPresetSchema>;

const PRESETS: Record<BehaviorPreset, DomainBehaviorConfig> = {
  manual: {
    schemaCreation: 'manual',
    schemaEvolution: 'fixed',
    webSearch: 'disabled',
    knowledgeValidation: 'trust_user',
    proactiveQuestioning: 'gentle',
    documentGeneration: 'manual',
  },
  balanced: {
    schemaCreation: 'web_research',
    schemaEvolution: 'suggest',
    webSearch: 'bootstrap_only',
    knowledgeValidation: 'flag_conflicts',
    proactiveQuestioning: 'active',
    documentGeneration: 'manual',
  },
  full_auto: {
    schemaCreation: 'web_research',
    schemaEvolution: 'auto',
    webSearch: 'full',
    knowledgeValidation: 'verify',
    proactiveQuestioning: 'active',
    documentGeneration: 'on_session_end',
  },
};

export function resolveBehaviorPreset(preset: BehaviorPreset): DomainBehaviorConfig {
  return { ...PRESETS[preset] };
}
