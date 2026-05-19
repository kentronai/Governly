import posthog from 'posthog-js'

const isLocalHost = () => {
  if (typeof window === 'undefined') return false

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

export const isPostHogEnabled = () => {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const enableLocalPostHog = process.env.NEXT_PUBLIC_ENABLE_POSTHOG_LOCAL === 'true'

  return Boolean(posthogKey) && (!isLocalHost() || enableLocalPostHog)
}

if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

  if (isPostHogEnabled() && posthogKey) {
    posthog.init(posthogKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      autocapture: false,
      capture_performance: false,
      capture_heatmaps: false,
      disable_session_recording: true,
      debug: false,
    
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
        return allowedEvents.includes(event.event) ? event : null
      },
    })
  }
}

export function capturePostHogEvent(eventName: string, properties?: Record<string, any>) {
  if (!isPostHogEnabled()) return

  posthog.capture(eventName, properties)
}

export default posthog
