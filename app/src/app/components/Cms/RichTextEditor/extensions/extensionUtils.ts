export const getStandardHtmlParser = (attr: string) => {
  return (element: Element): unknown => {
    const content = element.getAttribute(attr);
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  };
};

export const getJsonHtmlRenderer = (attr: string) => {
  return (attributes: Record<string, unknown>): Record<string, string> => {
    return {
      [attr]: attributes[attr] !== undefined ? JSON.stringify(attributes[attr]) : 'undefined',
    };
  };
};
