import { LazyImage } from '../LazyImage'

type FeatureRow = {
  kicker: string
  title: string
  blurb: string
  image: string
  imageAlt: string
  reverse?: boolean
}

const rows: FeatureRow[] = [
  {
    kicker: 'Zuri Assist',
    title: 'One brain for the floor and the guest',
    blurb:
      'Zuri Assist brings it together: smart guest surfaces, languages and dietary context on the menu, plus the ops layer your managers need — so service rhythm, recommendations, and intelligence stay aligned.',
    image: '/Zuri Assist.png',
    imageAlt: 'Zuri Assist — combined guest and operations AI'
  },
  {
    kicker: 'On the guest menu',
    title: 'For you, Trending, and Reorder',
    blurb:
      'Three rails guests already understand: personal picks, what the room is loving right now, and one tap back to their usual — no clutter, no extra apps.',
    image: '/Intelligence.png',
    imageAlt: 'ZURI guest menu — For you, Trending, and Reorder',
    reverse: true
  },
  {
    kicker: 'AI recommendations',
    title: 'AI recommendations & customer and business intelligence',
    blurb:
      'A different layer from For you, Trending, and Reorder: ranked picks, pairings, and readouts your team uses to tune the menu, promos, and margin before the next rush.',
    image: '/AI Rec.png',
    imageAlt: 'ZURI AI recommendations and business intelligence'
  }
]

function FeatureVisual({ src, alt }: { src: string; alt: string }): JSX.Element {
  return (
    <div className="relative w-full min-h-[12rem] sm:min-h-[14rem]">
      <LazyImage
        src={src}
        alt={alt}
        className="w-full object-contain object-center max-h-[min(78vw,28rem)] sm:max-h-[min(70vw,32rem)] lg:max-h-[36rem]"
      />
    </div>
  )
}

export function HomeKeyFeatures(): JSX.Element {
  return (
    <section className="relative overflow-hidden bg-zuri-light pt-16 pb-10 md:pt-24 md:pb-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute top-0 left-1/2 h-48 w-[min(90vw,40rem)] -translate-x-1/2 rounded-full bg-zuri-orange/[0.08] blur-[80px]" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
          <p className="mb-3 text-[13px] font-medium tracking-wide text-gray-500 sm:text-sm">Key features</p>
          <h2 className="text-3xl font-medium tracking-[-0.035em] text-zuri-black sm:text-4xl md:text-5xl md:leading-[1.08]">
            Show, don&apos;t stall.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-gray-600 sm:text-base">
            The same flows your guests use — in your colours.
          </p>
        </div>

        <div className="flex flex-col gap-14 md:gap-20">
          {rows.map(row => (
            <article
              key={row.title}
              className={`flex flex-col items-center gap-8 lg:gap-14 ${
                row.reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'
              }`}
            >
              <div className="w-full flex-1 lg:max-w-[54%]">
                <FeatureVisual src={row.image} alt={row.imageAlt} />
              </div>
              <div className="w-full flex-1 lg:max-w-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zuri-orange">{row.kicker}</p>
                <h3 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-zuri-black sm:text-3xl">{row.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">{row.blurb}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
