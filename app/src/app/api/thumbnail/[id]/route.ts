import {unstable_noStore} from 'next/cache';
import puppeteer from 'puppeteer';

export async function renderScreenshotWithPuppeteer(url: string) {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('requestfailed', req => console.error('FAILED:', req.url()));

    await page.setViewport({width: 320, height: 180});
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    await page.goto(url, {waitUntil: 'networkidle0'});
    const screenshot = await page.screenshot({path: 'map.jpeg'});
    return screenshot;
  } catch (error) {
    console.error('Error rendering screenshot:', error);
    return null;
  } finally {
    await browser.close();
  }
}

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  unstable_noStore();

  const {id} = await params; // 'a', 'b', or 'c'
  const url = new URL(`http://localhost:3000/__screenshot.html`);
  // set query params
  url.searchParams.set('api_url', process.env.NEXT_SERVER_API_URL || '');
  url.searchParams.set('document_id', id);
  url.searchParams.set('s3_url', process.env.NEXT_PUBLIC_S3_BUCKET_URL || '');
  const screenshot = await renderScreenshotWithPuppeteer(url.toString());
  return new Response(screenshot, {
    headers: {'content-type': 'image/jpeg'},
  });
}