'use client';
import dynamic from 'next/dynamic';

const DotLab = dynamic(() => import('@components/Lab/DotLab').then(m => m.DotLab), {ssr: false});

export default function DotLabPage() {
  return <DotLab />;
}
