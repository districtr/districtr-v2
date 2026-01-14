import type {MDXComponents} from 'mdx/types';
import {Heading, Text, Link} from '@radix-ui/themes';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Map markdown elements to Radix UI components for consistent styling
    h1: ({children}) => (
      <Heading as="h1" size="8" mb="4">
        {children}
      </Heading>
    ),
    h2: ({children}) => (
      <Heading as="h2" size="6" mt="6" mb="3">
        {children}
      </Heading>
    ),
    h3: ({children}) => (
      <Heading as="h3" size="5" mt="4" mb="2">
        {children}
      </Heading>
    ),
    p: ({children}) => (
      <Text as="p" size="3" mb="3">
        {children}
      </Text>
    ),
    a: ({href, children}) => (
      <Link href={href} target={href?.startsWith('http') ? '_blank' : undefined}>
        {children}
      </Link>
    ),
    ul: ({children}) => (
      <ul style={{marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-5)', listStyleType: 'disc'}}>
        {children}
      </ul>
    ),
    ol: ({children}) => (
      <ol style={{marginBottom: 'var(--space-3)', paddingLeft: 'var(--space-5)', listStyleType: 'decimal'}}>
        {children}
      </ol>
    ),
    li: ({children}) => (
      <li style={{marginBottom: 'var(--space-1)', fontSize: 'var(--font-size-3)', lineHeight: 'var(--line-height-3)'}}>
        {children}
      </li>
    ),
    strong: ({children}) => <strong style={{fontWeight: 600}}>{children}</strong>,
    code: ({children}) => (
      <code
        style={{
          backgroundColor: 'var(--gray-3)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.9em',
        }}
      >
        {children}
      </code>
    ),
    ...components,
  };
}
