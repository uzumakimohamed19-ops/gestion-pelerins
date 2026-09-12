import { Suspense } from 'react'
import ClientPage from './[id]/ClientPage'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientPage />
    </Suspense>
  )
}