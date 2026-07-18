import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/TopBar"
import { TooltipProvider } from "@/components/ui/tooltip"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          <SidebarProvider>
            <TooltipProvider>
              <AppSidebar />
              <SidebarInset className="overflow-hidden">
                <main>
                  <TopBar />
                  {children}
                </main>
              </SidebarInset>
            </TooltipProvider>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
