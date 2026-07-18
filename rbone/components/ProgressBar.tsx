"use client"

import * as React from "react"

import { Progress } from "@/components/ui/progress"

export function ProgressBar({
  className,
  value,
}: {
  className: string
  value: number
}) {
  const [progress, setProgress] = React.useState<number>(1)

  React.useEffect(() => {
    const timer = setTimeout(() => setProgress(value), 100)
    return () => clearTimeout(timer)
  }, [])

  return <Progress value={progress} className={className} />
}
