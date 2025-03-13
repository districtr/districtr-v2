import { Flex } from '@radix-ui/themes'
import { useRouter } from 'next/navigation'
 
const PlacePage = async ({
  params,
}: {
  params: Promise<{ place: string }>
}) => {
  const { place } = await params
  return <Flex direction={"row"} className='max-w-screen-xl mx-auto p-4'>
    Place: {place}
  </Flex>
}

export default PlacePage