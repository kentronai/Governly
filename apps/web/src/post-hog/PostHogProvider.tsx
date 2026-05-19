'use client'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { capturePostHogEvent, isPostHogEnabled } from '@/lib/posthog'

function PostHogTracking() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname && isPostHogEnabled()) {
      let url = window.origin + pathname
      if (searchParams.toString()) {
        url = url + `?${searchParams.toString()}`
      }
      capturePostHogEvent('$pageview', {
        $current_url: url,
      })
    }
  }, [pathname, searchParams])

  return null
}

export default function PostHogProvider({ children }: any) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogTracking />
      </Suspense>
      {children}
    </>
  )
}
