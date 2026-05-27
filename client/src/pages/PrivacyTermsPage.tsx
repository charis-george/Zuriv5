import { Link } from 'react-router-dom'
import { organizationJsonLd, usePageSeo } from '../lib/seo'

function PrivacyTermsPage(): JSX.Element {
  usePageSeo({
    title: 'Privacy Policy & Terms of Service | ZURI',
    description: 'Read ZURI privacy policy and terms of service covering business accounts, customer orders, payments, data handling, and platform use.',
    path: '/privacy',
    type: 'article',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'ZURI Privacy Policy and Terms of Service',
        url: 'https://zuriqo.com/privacy',
        description: 'Privacy policy and terms of service for the ZURI ordering and payment platform.'
      }
    ]
  })

  return (
    <div className="min-h-screen bg-white text-zuri-black">
      <header className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-zuri-black hover:opacity-80 transition">
            <img src="/ZURI.png" alt="ZURI logo" className="h-8 w-auto" />
            <span className="text-[11px] tracking-[0.32em] uppercase">Z U R I</span>
          </Link>
          <nav className="text-sm text-gray-500">
            <Link to="/" className="hover:text-zuri-orange transition">Home</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 md:py-14">
        <h1 className="text-2xl md:text-3xl tracking-tight">Privacy Policy &amp; Terms of Service</h1>
        <p className="text-gray-500 text-sm mt-2">Last updated: March 2026</p>

        <div className="mt-10 space-y-10 text-sm text-gray-700 leading-relaxed">
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-zuri-black mt-0">Important: We do not hold your money</h2>
            <p className="mb-0 mt-2">
              <strong>Zuri does not collect, store, or hold customer funds.</strong> We only facilitate payments through
              licensed third-party payment processors (such as Paystack). Card and payment details are processed directly by
              those providers. Payouts to businesses are made by the payment processor to the business&apos;s own bank
              account. Zuri is a software platform for menus, orders, and payment facilitation—not a custodian of funds.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">1. Welcome</h2>
            <p>
              Zuri provides digital ordering and payment facilitation for businesses (restaurants, cafés, events, etc.).
              Businesses use Zuri to publish menus, receive orders, and get paid; customers use Zuri to browse, order, and
              pay. This policy explains how we collect, use, and protect personal data and the terms that apply when you use
              Zuri.
            </p>
            <p className="mt-2">
              <strong>Roles:</strong> Depending on context, Zuri may act as a data controller (e.g. for your account, support,
              and platform operations) or as a data processor (e.g. when processing order and customer data on behalf of a
              business).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">2. Personal data we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account data:</strong> For businesses: name, email, password (hashed), phone, address, bank account
                details for payouts (held securely; used only to instruct the payment processor). For Zuri Tap customers:
                email, password (hashed), optional name and phone.
              </li>
              <li>
                <strong>Order and transaction data:</strong> Order details, amounts, status, and payment status. We do not
                store full card numbers; payment data is handled by the licensed payment processor.
              </li>
              <li>
                <strong>Usage data:</strong> Logs, device/browser information, and interaction data necessary to run and secure
                the service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">3. How we use personal data</h2>
            <p>
              We use personal data to: provide and operate the Zuri platform; facilitate orders and payments via third-party
              processors; provide analytics and insights to businesses; improve the product; prevent fraud and protect
              security; and comply with law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">4. How we share personal data</h2>
            <p>
              We may share data with: <strong>payment processors</strong> (to complete transactions);{' '}
              <strong>hosting and infrastructure providers</strong> (e.g. Supabase); <strong>the business</strong> you order
              from or whose storefront you use; and <strong>legal authorities</strong> when required. We do not sell personal
              data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">5. Payment processing &amp; no custody of funds</h2>
            <p>
              Payments are processed entirely by licensed third-party payment providers. Zuri does not collect, store, or hold
              customer funds. We do not store full card numbers or sensitive payment credentials. Payouts to businesses are
              executed by the payment processor to the business&apos;s designated bank account. Your use of Zuri is subject to
              the payment provider&apos;s terms and privacy policy where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">6. Data security &amp; retention</h2>
            <p>
              We use reasonable technical and organizational measures to protect personal data. Data is retained only as long as
              needed to provide the service, comply with law, resolve disputes, and enforce our agreements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">7. Your rights &amp; choices</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or object to certain processing of
              your data. Contact us (below) to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">8. Terms of Service</h2>
            <p>
              By using Zuri you agree to use the service lawfully and in line with these terms. Businesses are responsible for
              their menus, pricing, and compliance with applicable laws. We may suspend or terminate access for breach of
              terms or for operational or legal reasons. The service is provided &ldquo;as is&rdquo; to the extent permitted by
              law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">9. Changes to this policy</h2>
            <p>
              We may update this policy and will post the revised version with a new &ldquo;Last updated&rdquo; date. Continued
              use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zuri-black mb-2">10. Contact us</h2>
            <p>
              For privacy or terms questions:{' '}
              <a href="mailto:info@zuriqo.com" className="text-zuri-orange hover:underline">
                info@zuriqo.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default PrivacyTermsPage
