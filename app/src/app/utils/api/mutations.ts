// Export the AxiosErrorData type
export interface AxiosErrorData {
  detail: 'Invalid password' | 'Password required';
}

// Export all mutation observers
export {patchReset} from './mutations/patchReset';
