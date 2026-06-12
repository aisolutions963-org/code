import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import SWRProvider from '@/components/providers/SWRProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? 'WoodWings',
  description: 'WoodWings Fitout Services — Internal Operations Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SWRProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{ duration: 3000 }}
          />
        </SWRProvider>
      </body>
    </html>
  )
}
