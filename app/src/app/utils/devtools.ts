import { devtools as _devtools } from "zustand/middleware";

export const devtools: typeof _devtools =
  process.env.NODE_ENV === "development"
    ? (_devtools as any) //* desired behavior, but typescript doesn't like it
    : (stateCreatorFn) => stateCreatorFn;