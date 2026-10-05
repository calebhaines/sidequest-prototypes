# Put HOTPLATE online for free

**Recommended: Cloudflare Pages Direct Upload.** It hosts this browser-only app for free, provides HTTPS and a `pages.dev` address, and requires no credit card. HOTPLATE runs its audio synthesis and sample export on your device, so hosting needs only the static files in `dist`.

## Build once

**Ready-made option:** the included **`releases/FORM-hosting.zip`** is already built. Upload it at Cloudflare Pages Direct Upload; no local installation or build commands are needed. Its `index.html` is at the ZIP root.

To rebuild after editing the app:

Install [Node.js](https://nodejs.org/) 20 or newer, open a terminal in this project, then run:

```sh
npm install
npm run build
```

The finished website is in **`dist/`**. Upload this folder, including its `index.html` and `assets/` folder. Keep the source project for future edits.

## Cloudflare Pages: the recommended route

1. Create a free account at [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Open **Workers & Pages**, then **Create application**. Choose **Pages** if the dashboard offers a choice.
3. Choose **Get started → Drag and drop your files** / **Direct Upload**.
4. Name your project, for example `my-hotplate`.
5. Drop the **`dist` folder** into the upload area. A ZIP containing the contents of `dist` also works; `index.html` should be at the ZIP's top level.
6. Select **Deploy site** / **Save and Deploy**. Open the supplied `https://your-project.pages.dev` address.

To update the app, run `npm run build` again, open this Pages project, choose **Create a new deployment**, and upload the new `dist` folder to production.

Free static Pages hosting includes unlimited requests and bandwidth. Dashboard uploads support up to **1,000 files**, with **25 MiB per file**; this app's generated samples are downloaded locally and do not need to be hosted. A Direct Upload project cannot later change to Git integration; you can create a separate Git-connected project if you want automatic deployments.

## Netlify Drop: another quick option

1. Build the app using the commands above.
2. Open [Netlify Drop](https://app.netlify.com/drop). Sign in to a free account so you can manage the site later.
3. Drag the **`dist` folder** into the drop area.
4. Follow any **Publish** step shown by the dashboard and open the supplied `netlify.app` URL. Netlify's current account flow may create a private preview before you publish it.
5. For updates, rebuild and drag the new `dist` folder into the project's **Deploys** drop area.

Netlify's **Free** plan is $0 with a hard **300-credit monthly limit**. Production deployments, bandwidth, and requests consume credits; exceeding the limit pauses sites until the next billing cycle. The Free plan cannot incur usage charges. Choose Cloudflare Pages if you prefer free static hosting without Netlify's traffic credit budget.

## GitHub Pages: useful if you already use GitHub

1. Build the app. This project uses relative asset paths, so it also works under a repository URL.
2. Create a **public** GitHub repository.
3. Upload the **contents of `dist`** to a branch such as `gh-pages`, with `index.html` at that branch's root. Add an empty file named `.nojekyll`.
4. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `gh-pages` and **/(root)**, then save.
5. Open the published address, usually `https://USERNAME.github.io/REPOSITORY/`.

GitHub Pages is free for public repositories on GitHub Free. Published sites have a 1 GB size limit and a soft 100 GB/month bandwidth limit. It suits this personal creative tool; GitHub restricts use for commercial SaaS and websites primarily facilitating commercial transactions.

## Official sources

Checked on **October 3, 2026** against the providers' live pages:

- [Cloudflare Pages: free, no credit card, static requests and bandwidth](https://pages.cloudflare.com/)
- [Cloudflare Direct Upload: dashboard steps, ZIP/folder support and upload limits](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages platform limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Netlify pricing: Free plan, credits, and paused sites](https://www.netlify.com/pricing/)
- [Netlify deployment documentation: Drop and updating an existing site](https://docs.netlify.com/deploy/create-deploys/)
- [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

No hosting account has been created or deployment performed for you. These instructions produce a public URL using your chosen provider account.
