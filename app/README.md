This is a [Next.js](https://nextjs.org/) project bootstrapped with
[`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

Set up your development environment:

```bash
cp .env.dev .env.local
# install bun
npm i -g bun 
# install packages
bun install
```

First, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the
file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to
automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your
feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the
[Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)
from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more
details.


## CMS and Custom Components

We use TipTap for rich text editing. It compiles rich text to a nice JSON format that we toss to the backed as JSONB. 

Custom components in the CMS have three components:
1. Node - the configuration for TipTap to ingest the node schema
2. Node View - the editor view of what the node looks like while editing
3. Node Renderer - the output of the node for the frontend

In many cases, the view and renderer may be similar, but in other cases the view may need more interactivity while the renderer should work with SSR. For this reason, we use `html-react-parser` and a few dom node replacers configured under `components/RichTextRenderer` to help out convert from TipTap's generated HTML to more ergonomic react. 

This can be extended for both SSR and CSR components!