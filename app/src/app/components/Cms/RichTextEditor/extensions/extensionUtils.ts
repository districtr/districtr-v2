export const getStandardHtmlParser = (attr: string) => {
  return (element: Element) => {
    const content = element.getAttribute(attr);
    return content ? JSON.parse(content) : null;
  };
};

export const getJsonHtmlRenderer = (htmlAttr: string, sourceAttr: string = htmlAttr) => {
  return (attributes: Record<string, any>) => {
    return {
      [htmlAttr]:
        attributes[sourceAttr] !== undefined ? JSON.stringify(attributes[sourceAttr]) : '',
    };
  };
};
