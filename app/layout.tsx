import type { Metadata } from 'next'
import { Fira_Sans } from 'next/font/google'

const firaSans = Fira_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '900'], display: 'swap', variable: '--font-fira-sans' })

export const metadata: Metadata = {
  title: 'Tipsters',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={firaSans.variable}>
      <head>
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" />
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" />
        <style>{`
          * { font-family: var(--font-fira-sans), sans-serif; }
          body { background: #f0f0f0; font-size: 13px; color: #333; }
          .text-success { color: #4dbfa2 !important; }
          .text-danger  { color: #eb6379 !important; }
          a.tipster-block:hover { box-shadow: 0 2px 6px rgba(0,0,0,.1); }
        `}</style>
      </head>
      <body>
        {children}
        <script src="https://code.jquery.com/jquery-3.2.1.min.js" defer />
        <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js" defer />
      </body>
    </html>
  )
}
