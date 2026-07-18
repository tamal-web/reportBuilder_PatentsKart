"use client"
import {
  FileText,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"

import { ReportListItem } from "@/lib/api"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { useRouter } from "next/navigation"

interface GlobalSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reports: ReportListItem[]
}

export function GlobalSearch({
  open,
  onOpenChange,
  reports,
}: GlobalSearchProps) {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-4">
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigation">
              <CommandItem
                onSelect={() => {
                  router.push("/")
                  onOpenChange(false)
                }}
              >
                <HomeIcon />
                <span>Home</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  router.push("/settings")
                  onOpenChange(false)
                }}
              >
                <SettingsIcon />
                <span>Settings</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  router.push("/models")
                  onOpenChange(false)
                }}
              >
                <SparklesIcon />
                <span>Models</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  router.push("/intake")
                  onOpenChange(false)
                }}
              >
                <PlusIcon />
                <span>New Report</span>
              </CommandItem>
              <CommandSeparator />

              <CommandGroup heading="Reports">
                {reports.map((m, i) => (
                  <CommandItem
                    key={i}
                    onSelect={() => {
                      router.push(`/workspace/${m.id}`)
                      onOpenChange(false)
                    }}
                  >
                    <FileText />
                    <span>{m.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}
