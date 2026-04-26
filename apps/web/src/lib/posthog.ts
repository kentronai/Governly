import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const sessionRecordingEnabled =
    process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING === 'true';
  
  if (posthogKey) {    
    posthog.init(posthogKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: true,
      autocapture: false,
      capture_performance: false,
      capture_heatmaps: false,
      disable_session_recording: !sessionRecordingEnabled,
      session_recording: sessionRecordingEnabled
        ? {
            recordCrossOriginIframes: true,
          }
        : undefined,
      debug: process.env.NEXT_PUBLIC_POSTHOG_DEBUG === 'true',
    
      before_send: (event: any) => {
        // Allow all our custom events
        const allowedEvents = [
          '$exception',
          'react_error_boundary',
          'javascript_error',
          'unhandled_promise_rejection',
          'api_call',
          'api_error',
          'server_api_call',
          'server_api_error',
          '$pageview'
        ]
        if (sessionRecordingEnabled && event.event === '$snapshot') {
          return event
        }

        return allowedEvents.includes(event.event) ? event : null
      },
    })
  }
}

export default posthog
