import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sonat Studio',
  description: 'Procesamiento de audio inteligente local',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.className} min-h-screen relative overflow-x-hidden`}>
        {/* Background glow effects */}
        <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="fixed bottom-[-10%] right-[-10%] w-[35%] h-[35%] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
        
        <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
