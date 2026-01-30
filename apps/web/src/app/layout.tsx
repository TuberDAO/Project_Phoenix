import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navigation } from '@/components/Navigation';
import { Providers } from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Project Phoenix - Insider Detection',
  description: 'Detect insider whales on prediction markets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navigation />
        <Providers>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
