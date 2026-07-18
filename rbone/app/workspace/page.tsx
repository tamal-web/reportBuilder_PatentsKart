import { Suspense } from "react"
import WorkspacePageClient from "./page-client"

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading workspace...</div>}>
      <WorkspacePageClient />
    </Suspense>
  )
}
