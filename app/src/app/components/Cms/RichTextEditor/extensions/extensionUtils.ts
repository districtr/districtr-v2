export const getStandardHtmlParser = (attr: string) => {
  return (element: Element) => {
    const content = element.getAttribute(attr);
    return content ? JSON.parse(content) : null;
  };
};

export const getJsonHtmlRenderer = (attr: string) => {
  return (attributes: Record<string, any>) => {
    return {
      [attr]: attributes[attr] !== undefined ? JSON.stringify(attributes[attr]) : 'undefined',
    };
  };
};
