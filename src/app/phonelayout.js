// src/app/layout.js
import './globals.css';

export const metadata = {
  title: 'Bickers Booking',
  description: 'Employee App',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="var(--color-info)" />
      </head>
      <body>{children}</body>
    </html>
  );
}
