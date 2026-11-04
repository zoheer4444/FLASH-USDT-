import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BSC Console',
  description: 'Connect a wallet, sign messages and send transactions on BNB Smart Chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0b0c0f] text-[#e8e9ec] antialiased" style={{ colorScheme: 'dark' }}>
        {children}
      </body>
    </html>
  );
}
