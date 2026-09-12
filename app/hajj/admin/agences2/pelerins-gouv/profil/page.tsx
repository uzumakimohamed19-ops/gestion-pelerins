import { Suspense } from 'react'
import ClientPage from '../../[id]/pelerins-gouv/[pelerinId]/ClientPage'

export default function Page() {
  return <Suspense fallback={null}><ClientPage /></Suspense>
}