'use client';

import dynamic from 'next/dynamic';

const VortexBackground = dynamic(
  () => import('./VortexBackground').then(m => m.VortexBackground),
  { ssr: false }
);

export default function VortexWrapper() {
  return <VortexBackground />;
}
