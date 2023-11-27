import { PayloadAction, createSlice } from "@reduxjs/toolkit"
import { initialState } from "./initialState"
import { ColorSchemes, DistrictId, Geoid } from "./types";

export const interfaceSlice = createSlice({
  name: 'interface',
  initialState: initialState,
  reducers: {
    setProblemId: (state, action: PayloadAction<string>) => {
      state.problemId = action.payload;
    },
    setPlanId: (state, action: PayloadAction<string>) => {
      state.planId = action.payload;
    },
    setColorScheme: (state, action: PayloadAction<ColorSchemes>) => {
      state.colorScheme = action.payload;
    },
    setUnit: (state, action: PayloadAction<string>) => {
      state.unit = action.payload;
    },
    assignIds: (state, action: PayloadAction<Record<Geoid, DistrictId>>) => {
      state.assignment = {
        ...state.assignment,
        ...action.payload
      }
    }
  }
})
