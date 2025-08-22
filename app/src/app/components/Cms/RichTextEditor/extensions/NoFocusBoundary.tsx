export const NoFocusBoundary = ({
  children,
  parentRef,
}: {
  children: React.ReactNode;
  parentRef: React.RefObject<HTMLDivElement>;
}) => {
  const handleFocusNextParent = (e: React.FocusEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // find next parent that is not a NoFocusBoundary
    const nextParent = parentRef.current?.parentElement?.parentElement;
    if (nextParent && nextParent.getAttribute('data-no-focus-boundary') !== 'true') {
      nextParent.focus();
    }
  };
  return (
    <div onFocusCapture={handleFocusNextParent} className="pointer-events-none">
      {children}
    </div>
  );
};
