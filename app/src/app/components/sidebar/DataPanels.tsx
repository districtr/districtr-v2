import {Box} from '@radix-ui/themes';
import Evaluation from '@components/sidebar/Evaluation';
import PopulationPanel from '@components/sidebar/PopulationPanel';
import React from 'react';
import classNames from "classnames";
import * as Accordion from "@radix-ui/react-accordion";
import { DoubleArrowDownIcon } from "@radix-ui/react-icons";
import {useMapStore} from '@/app/store/mapStore';

interface DataPanelSpec {
  title: string;
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

interface DataPanelsProps {
  panels?: DataPanelSpec[];
}

const defaultPanels: DataPanelSpec[] = [
  {
    title: 'population',
    label: 'Population',
    content: <PopulationPanel />,
  },
  // {
  //   title: 'layers',
  //   label: 'Data layers',
  //   content: <Layers />,
  // },
  {
    title: 'evaluation',
    label: 'Evaluation',
    content: <Evaluation />,
  },
];

const DataPanels: React.FC<DataPanelsProps> = ({
  panels = defaultPanels,
}) => {
  const sidebarPanels = useMapStore(state => state.sidebarPanels);
  const setSidebarPanels = useMapStore(state => state.setSidebarPanels);
  return (
    <Accordion.Root 
      type="multiple" 
      className="AccordionRoot" 
      value={sidebarPanels}
      onValueChange={setSidebarPanels}
      >
      {panels.map(panel => (
      <Accordion.Item 
        key={panel.title} 
        value={panel.title} 
        className="AccordionItem border-[1px] border-gray-300 rounded-lg my-1 bg-white"
        defaultValue={'open'}
        o
      >
        <AccordionTrigger className="AccordionTrigger">
        {panel.label}
        </AccordionTrigger>
        <AccordionContent className="AccordionContent">
        {panel.content}
        </AccordionContent>
      </Accordion.Item>
      ))}
    </Accordion.Root>
  );
};


const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Accordion.Trigger>
>(({ children, className, ...props }, forwardedRef) => (
  <Accordion.Header className="flex">
    <Accordion.Trigger
      className={classNames(
        `bg-white group flex h-[45px] flex-1 cursor-default items-center justify-between px-5 leading-none rounded-md data-[state=closed]:shadow-md outline-none hover:bg-blue-200`,
        className,
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
      <DoubleArrowDownIcon
        className="text-violet10 transition-transform duration-300 ease-[cubic-bezier(0.87,_0,_0.13,_1)] group-data-[state=open]:rotate-180"
        aria-hidden
      />
    </Accordion.Trigger>
  </Accordion.Header>
));

AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Accordion.Content>
>(({ children, className, ...props }, forwardedRef) => (
  <Accordion.Content
    className={classNames(
      "overflow-hidden text-[15px] data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown",
      className,
    )}
    {...props}
    ref={forwardedRef}
  >
    <div className="px-5 py-[15px]">{children}</div>
  </Accordion.Content>
));
AccordionContent.displayName = 'AccordionContent';

export default DataPanels;
