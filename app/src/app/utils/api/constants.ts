export const API_URL =
  typeof window === 'undefined'
    ? (process.env.NEXT_SERVER_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL;
