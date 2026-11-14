# Setting up DriveIQ

This guide takes you from nothing to a working DriveIQ on your own Cloudflare account, behind a login only you can pass. Plan on about 20 minutes, most of it waiting for the first deploy and for your owner's manual to upload.

DriveIQ is **single-owner by design**: one vehicle, one shared Aiana conversation, one login. Everything it stores lives in your own Cloudflare account.

## Before you start

You need two accounts:

| Account | What DriveIQ uses it for | Where |
|---|---|---|
| **Cloudflare** | Runs the app (Workers), stores your records (D1), page images (R2) and the document search index (Vectorize), makes embeddings (Workers AI), and handles the login (Access) | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) |
| **Anthropic** | Claude writes Aiana's answers | [console.anthropic.com](https://console.anthropic.com/) |

Both bill by usage beyond what their plans include. Check their current plans and limits before you start: [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Vectorize](https://developers.cloudflare.com/vectorize/platform/pricing/), [Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [Anthropic](https://www.anthropic.com/pricing#api).

You'll also need a **GitHub** (or GitLab) account: the Deploy button copies DriveIQ into a repository of your own, and every push to it redeploys.

## 1. Get an Anthropic API key

1. Sign in at [console.anthropic.com](https://console.anthropic.com/).
2. Go to **API keys** → **Create key**. When asked where your code runs, choose **Somewhere else** (a Cloudflare Worker needs a regular API key). Name it `driveiq`.
3. Copy the key (it starts with `sk-ant-`). You'll paste it in the next step, and you can't view it again later.

DriveIQ uses **Claude Haiku 5.5** by default, which is quick and works well for answering from your own documents. To use another model, change `CLAUDE_MODEL` in `wrangler.jsonc` (or under the Worker's **Settings** → **Variables and Secrets**).

## 2. Deploy to Cloudflare

1. Click the button:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ry-ops/DriveIQ)

2. Sign in to Cloudflare and connect your GitHub account when asked.
3. On the setup page:
   - **Project name**: keep `driveiq` or pick your own. It becomes part of your app's address.
   - **Resources**: Cloudflare creates a D1 database, an R2 bucket and a Vectorize index for you. The defaults are fine.
   - **ANTHROPIC_API_KEY**: paste the key from step 1. It's stored as an encrypted secret.
   - **Build and deploy commands**: keep the pre-filled `npm run build` and `npm run deploy`. The deploy command also sets up the database tables.
4. Click **Create and deploy**, and wait for the first build to finish (a few minutes).

When it's done, the dashboard shows your app's address, something like `https://driveiq.<your-subdomain>.workers.dev`. If you open it now you'll see **Finish setting up DriveIQ**. That's expected: it stays locked until step 3 is done.

## 3. Turn on the login (required)

DriveIQ holds your service history and spends your Anthropic key, so it refuses to work until it's behind **Cloudflare Access**. This step has two parts.

### 3a. Put Access in front of the app

1. In the Cloudflare dashboard, go to **Workers & Pages** and select your DriveIQ Worker.
2. Open the **Access** tab and select **Protect this Worker behind Access**.
3. Under **Scope**, choose **All traffic**. The default, *Previews only*, leaves your app itself public.
4. Under **Authentication policy**, add a policy that allows only you, for example the pre-configured **Cloudflare account** policy, or an email policy with your own address. Access sends a one-time code to that address when you sign in. To also require an authenticator app, see [Cloudflare's MFA settings](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/mfa-requirements/).
5. Select **Apply Access**.

If this is your first time using Cloudflare Access, the dashboard asks you to choose a **team name** first. Any name works; it becomes `https://<team-name>.cloudflareaccess.com`.

### 3b. Tell DriveIQ which login to trust

DriveIQ checks every request's Access sign-in itself, so a mistake in step 3a fails closed instead of leaving your data open. After you apply Access, the Worker's **Access** tab shows two **Application values**:

| Setting | Value to use |
|---|---|
| `ACCESS_AUD` | The **AUD tag** |
| `ACCESS_TEAM_DOMAIN` | The start of the **JWKS** address, up to `.com`: for `https://your-team.cloudflareaccess.com/cdn-cgi/access/certs`, use `https://your-team.cloudflareaccess.com` |

Add both on your Worker under **Settings** → **Variables and Secrets** → **Add**, type **Text**, then **Deploy**. They survive later deploys (`keep_vars` in `wrangler.jsonc`).

Open your app's address again. Access asks you to sign in, and then DriveIQ's first screen appears.

## 4. First use

1. **Add your vehicle**: year, make, model and current mileage. The VIN is optional.
2. **Upload your owner's manual**: **Settings** → **Documents** → **Upload**, and pick the PDF. DriveIQ reads it in your browser, indexes the text, then saves an image of every page so Aiana can show the pages it used. A 500-page manual takes a few minutes; the text is searchable as soon as the first part finishes. Add your maintenance guide and any service records the same way.
3. **Match the maintenance schedule to your manual**: **Settings** → **Maintenance schedule** starts with general intervals. Change them to what your owner's manual says, and add or remove services.
4. **Log what's been done**: on **Home**, use **Log service** on a forecast card, or ask Aiana ("I had the oil changed today at 42,000 miles").
5. **Ask Aiana a test question**, e.g. *"How much oil does the engine take?"* The answer should cite a page from your manual and show its thumbnail.

Optional: **Home** → **Recalls** → **Check NHTSA now** looks up recalls for your make, model and year.

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| **Finish setting up DriveIQ** | `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` isn't set. Do step 3b. |
| "Your sign-in couldn't be verified" | The two values don't match the Access application in front of this URL. Recheck the AUD tag for *this* application, and that the team domain starts with `https://`. |
| Aiana: "invalid x-api-key", or answers fail | The Anthropic key is wrong or revoked. In **AI** → **AI Gateway** → **default** → **Logs** you'll see a `401`. Create a new key and update `ANTHROPIC_API_KEY` under **Variables and Secrets**. |
| Aiana says document search is unavailable | Vectorize couldn't be reached (a `503` from `/api/search`). Check **Storage & databases** → **Vectorize** → `driveiq-docs` exists, and try again in a minute. |
| A document you just uploaded isn't found | Vectorize adds new text a few seconds after an upload finishes. Wait a moment and ask again. |
| Aiana gives a blank or very short answer | Ask again with more detail. If it keeps happening, check the AI Gateway logs for errors. |
| Every page asks you to sign in again | Normal when your Access session expires (24 hours by default). Change it in the Access application's settings. |
| The deploy fails at "migrations" | The database binding must be named `DB`. If you renamed it in `wrangler.jsonc`, rename it back. |

## Manual install (command line)

If you'd rather not use the button:

```sh
git clone https://github.com/ry-ops/DriveIQ.git
cd DriveIQ
npm install
npx wrangler login
npx wrangler d1 create driveiq
npx wrangler r2 bucket create driveiq-pages
npx wrangler vectorize create driveiq-docs --dimensions=768 --metric=cosine
npm run build
npm run deploy
npx wrangler secret put ANTHROPIC_API_KEY
```

If `d1 create` asks whether to add the database to your config, either answer works: Wrangler finds it by name. `npm run deploy` applies the database tables and deploys the Worker. Then continue with step 3.

### Local development

```sh
cp .dev.vars.example .dev.vars        # add your Anthropic key
echo 'ALLOW_UNAUTHENTICATED=true' >> .dev.vars
npm run db:migrate:local
npm run dev
```

`ALLOW_UNAUTHENTICATED=true` turns the login check off. Use it only on your own machine, never on a deployed Worker. Search (Vectorize) and embeddings (Workers AI) always run on Cloudflare, even in local development.

## Updating

Pull the latest changes from `ry-ops/DriveIQ` into your own repository and push. Workers Builds redeploys automatically and applies any new database tables.
