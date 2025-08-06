export const getStandardHtmlParser = (attr: string) => {
  return (element: Element) => {
    const content = element.getAttribute(attr);
    return content ? JSON.parse(content) : null;
  };
};
