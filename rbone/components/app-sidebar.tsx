"use client"

import * as React from "react"
import {
  BookOpen,
  Bot,
  Command,
  LifeBuoy,
  Send,
  Settings2,
  SparklesIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import { LayoutDashboard, FileText, History, Settings } from "lucide-react"
interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/job-history", label: "Job History", icon: History },
  { href: "/templates", label: "Manage Templates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
]

const data = {
  user: {
    name: "Tamal Krishna",
    email: "tamalkchhabra2007@gmail.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      isActive: true,
      items: [],
    },
    //  {
    //    title: "Job History",
    //    url: "/history",
    //   icon: History,
    //   items: [],
    // },
    // {
    //   title: "Manage Templates",
    //   url: "/templates",
    //   icon: FileText,
    //   items: [],
    //  },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
      items: [],
    },
    {
      title: "Models",
      url: "/models",
      icon: SparklesIcon,
      items: [],
    },
  ],
  navSecondary: [
    //{
    // title: "Documentation",
    //url: "/documentation",
    // icon: LifeBuoy,
    //},
  ],
  projects: [],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">PatentsKart</span>
                  <span className="truncate text-xs">Report Builder</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        {/*
                <NavUser user={data.user} />

        */}
      </SidebarFooter>
    </Sidebar>
  )
}
