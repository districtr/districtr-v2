import { configureStore } from '@reduxjs/toolkit'
import { interfaceSlice } from './slice'

export const store = configureStore({
  reducer: interfaceSlice.reducer
})