const isLocalHost = () => {
  if (typeof window === 'undefined') return false

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

export const isPostHogEnabled = () => {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const enableLocalPostHog = process.env.NEXT_PUBLIC_ENABLE_POSTHOG_LOCAL === 'true'

  return Boolean(posthogKey) && (!isLocalHost() || enableLocalPostHog)
}

type PostHogClient = typeof import('posthog-js')['default']

let posthogPromise: Promise<PostHogClient | null> | null = null

const loadPostHog = (): Promise<PostHogClient | null> => {
  if (typeof window === 'undefined' || !isPostHogEnabled()) {
    return Promise.resolve(null)
  }

  if (!posthogPromise) {
    posthogPromise = import('posthog-js').then(({ default: posthog }) => {
      const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
      if (!posthogKey) return null

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

      return posthog
    })
  }

  return posthogPromise
}

export function capturePostHogEvent(eventName: string, properties?: Record<string, any>) {
  if (!isPostHogEnabled()) return

  void loadPostHog().then((posthog) => {
    posthog?.capture(eventName, properties)
  })
}
