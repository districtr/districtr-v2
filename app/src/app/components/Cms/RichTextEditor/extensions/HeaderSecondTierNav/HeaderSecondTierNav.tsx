"use client";
import React, { useEffect, useState } from "react";
import { Flex } from "@radix-ui/themes";
import { Button } from "@radix-ui/themes";

export const HeaderSecondTierNav: React.FC<{
  allowlistHeaders?: string[];
}> = ({allowlistHeaders=[
  'Overview',
  'Welcome',
  'Current Map',
  'Current Plan',
  'Proposed Map',
  'Proposed Plan',
  'Draw Your Own Map',
  'Add Your Comment',
  'Community Comments'
]}) => {
  const [headers, setHeaders] = useState<any[]>([]);


  useEffect(() => {
    const headers = document.querySelectorAll('h2');
    setHeaders(Array.from(headers).filter(header => allowlistHeaders?.includes(header?.textContent ?? '')));
  }, []);

  return (
    // sticky top-0
    <Flex direction="row" gap="8" className="sticky top-12 z-20 bg-white py-4 px-2 w-full">
      {headers.map((header, i) => (
        <Button key={i} variant={'ghost'}
        className="text-sm cursor-pointer"
        onClick={() => {
          if (header) {
            const el = header;
            const y = el.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({top: y, behavior: 'smooth'});
          }
        }}
        >{header.textContent}</Button>
      ))}
    </Flex>
  );
};