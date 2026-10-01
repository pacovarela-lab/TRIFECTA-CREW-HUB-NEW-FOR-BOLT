import type { ComponentType } from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome.tsx'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { template as betaFeedbackAlertTemplate } from './beta-feedback-alert.tsx'
import { template as aiQualityAlertTemplate } from './ai-quality-alert.tsx'
import { template as bankImportAlertTemplate } from './bank-import-alert.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'beta-feedback-alert': betaFeedbackAlertTemplate,
  'ai-quality-alert': aiQualityAlertTemplate,
  'bank-import-alert': bankImportAlertTemplate,
}
