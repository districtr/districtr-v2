import { Dispatch, SetStateAction, useEffect, useState } from "react"

type UseLocalStorageHook = <T extends unknown>(initialValue: T, key: string, updateTrigger: unknown) => [value: T, Dispatch<SetStateAction<T>>]

export const useLocalStorage: UseLocalStorageHook = (initialValue, key, updateTrigger) => {
  const [value, setValue] = useState<typeof initialValue>(() => {
    // Check if the value exists in localStorage on mount
    const storedValue = localStorage.getItem(key);
    return storedValue !== null ? JSON.parse(storedValue) : initialValue;
  });

  useEffect(() => {
    const storedValue = localStorage.getItem(key);
    storedValue !== null && setValue(JSON.parse(storedValue))
  },[updateTrigger])

  useEffect(() => {
    // Update localStorage when the value changes
    if (value !== undefined) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, [key, value]);

  return [value, setValue];
};