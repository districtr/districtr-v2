// Export the AxiosErrorData type
export interface AxiosErrorData {
  detail: 'Invalid password' | 'Password required';
}

// Export all mutation observers
export {patchShatter} from './mutations/patchShatter';
export {patchUnShatter} from './mutations/patchUnShatter';
export {patchUpdates} from './mutations/patchUpdates';
export {patchReset} from './mutations/patchReset';
export {document} from './mutations/document';
export {metadata} from './mutations/metadata';
export {sharePlan} from './mutations/sharePlan';
export {sharedDocument} from './mutations/sharedDocument';
export {checkoutDocument} from './mutations/checkoutDocument';
