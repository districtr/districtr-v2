'use client';
import React, {useState} from 'react';
import {Button} from '@radix-ui/themes';
import {UploadIcon} from '@radix-ui/react-icons';
import {UploaderModal} from '@/app/components/Toolbar/UploaderModal';

/** "Upload block assignments" button + uploader modal, for static pages
 * (the landing page map section) that are server components. */
export const ImportBlockAssignments: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="soft" className="cursor-pointer self-start">
        <UploadIcon /> Upload block assignments
      </Button>
      <UploaderModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};
