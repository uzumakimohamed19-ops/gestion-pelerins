import { Suspense } from 'react'
import ClientPage from '../[id]/pelerins-gouv/ClientPage'

export default function Page() {
  return <Suspense fallback={null}><ClientPage /></Suspense>
}