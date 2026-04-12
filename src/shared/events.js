// Research event logger. When research_mode is OFF this is a no-op, so
// it's safe to sprinkle logEvent(...) calls throughout the product code
// without worrying about perf impact or storage bloat for non-research
// users.

import { getDb } from './storage.js';
import {
  isResearchMode, getParticipantId, getCondition, getSessionId,
} from './research.js';

export const EVENT = {
  PAGE_VISIT:              'page_visit',
  ANALYZE_START:           'analyze_start',
  ANALYZE_COMPLETE:        'analyze_complete',
  ANALYZE_ERROR:           'analyze_error',
  ANALYZE_DEDUPED:         'analyze_deduped',
  ANALYZE_CAPPED:          'analyze_capped',
  SIDEPANEL_OPEN:          'sidepanel_open',
  SIDEPANEL_CLOSE:         'sidepanel_close',
  SIDEPANEL_VIEW_DURATION: 'sidepanel_view_duration',
  PERSPECTIVE_IMPRESSION:  'perspective_impression',
  PERSPECTIVE_CLICK:       'perspective_click',
  PERSPECTIVE_THUMBS_UP:   'perspective_thumbs_up',
  PERSPECTIVE_THUMBS_DOWN: 'perspective_thumbs_down',
  PERSPECTIVE_DISMISS:     'perspective_dismiss',
  CONSOLIDATION_TRIGGER:   'consolidation_trigger',
  CONSOLIDATION_COMPLETE:  'consolidation_complete',
  DASHBOARD_VIEW:          'dashboard_view',
  SETTINGS_OPEN:           'settings_open',
  RESEARCH_CONSENT:        'research_consent',
  RESEARCH_WITHDRAW:       'research_withdraw',
  DATA_EXPORT:             'data_export',
  SESSION_START:           'session_start',
};

async function hashUrl(url) {
  try {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(url),
    );
    return Array.from(new Uint8Array(buf))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/**
 * Log an event. No-op when research mode is off.
 *
 * URLs in context are SHA-256 hashed (first 16 hex) unless
 * context.keepUrl is explicitly true. Keep that flag off for any
 * study where participants haven't opted in to full-URL logging.
 */
export async function logEvent(eventType, context = {}) {
  try {
    if (!(await isResearchMode())) return;

    const enrichedContext = { ...context };
    if (context.url && !context.keepUrl) {
      enrichedContext.url_hash = await hashUrl(context.url);
      delete enrichedContext.url;
    }
    delete enrichedContext.keepUrl;

    const record = {
      session_id:     await getSessionId(),
      participant_id: await getParticipantId(),
      condition:      await getCondition(),
      timestamp:      new Date().toISOString(),
      event_type:     eventType,
      context:        enrichedContext,
    };

    const db = await getDb();
    await db.add('events', record);
  } catch (err) {
    // Never let telemetry break the product.
    console.warn('[EchoBreaker] logEvent failed:', err);
  }
}
