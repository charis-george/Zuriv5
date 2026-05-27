import { useEffect } from 'react'

export const SITE_URL = 'https://zuriqo.com'
export const SITE_NAME = 'ZURI'
export const LOGO_URL = `${SITE_URL}/ZURI.png`
export const DEFAULT_OG_IMAGE = `${SITE_URL}/ZURI.png`

type JsonLd = Record<string, unknown> | Record<string, unknown>[]

type SeoOptions = {
  title: string
  description: string
  path?: string
  image?: string
  type?: 'website' | 'article'
  noindex?: boolean
  jsonLd?: JsonLd
}

function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertLink(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

export function usePageSeo(options: SeoOptions): void {
  useEffect(() => {
    const canonical = absoluteUrl(options.path || window.location.pathname)
    const image = options.image || DEFAULT_OG_IMAGE

    document.title = options.title
    upsertMeta('meta[name="description"]', 'name', 'description', options.description)
    upsertMeta('meta[name="robots"]', 'name', 'robots', options.noindex ? 'noindex,nofollow' : 'index,follow')
    upsertLink('canonical', canonical)

    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME)
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', options.title)
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', options.description)
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', options.type || 'website')
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical)
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', image)

    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image')
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', options.title)
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', options.description)
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image)

    const existing = document.getElementById('zuri-page-jsonld')
    if (existing) existing.remove()
    if (options.jsonLd) {
      const script = document.createElement('script')
      script.id = 'zuri-page-jsonld'
      script.type = 'application/ld+json'
      script.text = JSON.stringify(options.jsonLd)
      document.head.appendChild(script)
    }
  }, [options.description, options.image, options.jsonLd, options.noindex, options.path, options.title, options.type])
}

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: LOGO_URL
  },
  sameAs: [SITE_URL]
}

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    logo: {
      '@type': 'ImageObject',
      url: LOGO_URL
    }
  }
}
