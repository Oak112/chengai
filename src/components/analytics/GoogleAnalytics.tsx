import Script from 'next/script';
import { Suspense } from 'react';
import { GA_MEASUREMENT_ID, GA_MEASUREMENT_IDS } from '@/lib/ga';
import GoogleAnalyticsPageView from '@/components/analytics/GoogleAnalyticsPageView';

export default function GoogleAnalytics() {
  if (process.env.NODE_ENV !== 'production') return null;
  if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_IDS.length === 0) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
${GA_MEASUREMENT_IDS.map((id) => `gtag('config', '${id}', { send_page_view: false });`).join('\n')}
`}
      </Script>
      <Suspense fallback={null}>
        <GoogleAnalyticsPageView />
      </Suspense>
    </>
  );
}
