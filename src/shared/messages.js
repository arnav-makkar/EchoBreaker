// All message types exchanged between extension contexts (content script,
// service worker, side panel, popup, options). Using constants prevents
// typo-driven bugs where one side sends 'PAGE_CONTENT' and the other
// listens for 'page_content'.

export const MSG = {
  PAGE_CONTENT:         'PAGE_CONTENT',          // content -> SW
  GET_DASHBOARD:        'GET_DASHBOARD',         // popup -> SW
  CONSOLIDATE_NOW:      'CONSOLIDATE_NOW',       // popup -> SW
  FEEDBACK:             'FEEDBACK',              // sidepanel -> SW
  TEST_KEY:             'TEST_KEY',              // options -> SW
  CLEAR_DATA:           'CLEAR_DATA',            // options -> SW
  EXPORT_DATA:          'EXPORT_DATA',           // options -> SW
  GET_ANALYSIS_FOR_URL: 'GET_ANALYSIS_FOR_URL',  // sidepanel -> SW
};
