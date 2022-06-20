import { useEffect } from 'react'
import { useRouter } from 'next/router'
const Index = () => {
  const router = useRouter()

  useEffect(() => {
    const mainUrl = '/dao/SLND'
    router.replace(mainUrl)
  }, [])

  return null
}

export default Index
