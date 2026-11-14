import { Lock } from 'lucide-react'
import type { Health } from '@/types'

// Shown while the Worker refuses API requests because setup isn't finished.
export default function SetupRequired({ health }: { health: Health }) {
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md p-8 space-y-4 text-gray-700">
      <div className="flex items-center gap-3">
        <Lock className="h-7 w-7 text-accent" />
        <h1 className="text-2xl font-bold text-gray-900">Finish setting up DriveIQ</h1>
      </div>
      {health.access === 'access_not_configured' && (
        <>
          <p>
            DriveIQ is locked until it's behind a login, because it holds your records and uses your Anthropic key. Two steps
            in the Cloudflare dashboard:
          </p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              <strong>Workers &amp; Pages</strong> → your DriveIQ Worker → <strong>Access</strong> tab →{' '}
              <strong>Protect this Worker behind Access</strong>. Choose scope <strong>All traffic</strong> (not Previews only), add a
              policy that allows only you, and apply it.
            </li>
            <li>
              The same <strong>Access</strong> tab then shows the application's <strong>AUD tag</strong> and <strong>JWKS</strong> address.
              Under <strong>Settings</strong> → <strong>Variables and Secrets</strong>, add <code>ACCESS_AUD</code> (the AUD tag) and{' '}
              <code>ACCESS_TEAM_DOMAIN</code> (the JWKS address up to <code>.com</code>, e.g.{' '}
              <code>https://your-team.cloudflareaccess.com</code>). Then reload this page.
            </li>
          </ol>
        </>
      )}
      {(health.access === 'not_signed_in' || health.access === 'invalid_token') && (
        <p>
          Your sign-in couldn't be verified. Make sure Cloudflare Access is turned on for this exact URL, and that{' '}
          <code>ACCESS_TEAM_DOMAIN</code> and <code>ACCESS_AUD</code> match that Access application. Then sign in again.
        </p>
      )}
      {health.anthropic_key === 'missing' && (
        <p>
          Also missing: the <code>ANTHROPIC_API_KEY</code> secret, which Aiana needs to answer. Add it under <strong>Variables and Secrets</strong>.
        </p>
      )}
      <p className="text-sm text-gray-500">The full walkthrough is in docs/SETUP.md in the DriveIQ repository.</p>
    </div>
  )
}
