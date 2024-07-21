import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import nock from "nock";
import { usePostMapData } from "./apiHandlers"; // Make sure this path is correct
import { describe, afterEach, it } from "node:test";
import { expect } from "@jest/globals";

const queryClient = new QueryClient();

describe("usePostMapData", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("should successfully post map data", async () => {
    // Define the map data and the expected response
    const mapObject = map.current;
    const response = { success: true };

    // Set up Nock to intercept the POST request and return a mock response
    nock("http://localhost").post("/save-map", mapObject).reply(200, response);

    // Render the hook
    const { result } = renderHook(() => usePostMapData(), { wrapper: Wrapper });

    // Act: Trigger the mutation
    act(() => {
      result.current.mutate(mapObject);
    });

    // Wait for the mutation to settle
    await waitFor(() => result.current.isSuccess);

    // Assertions
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual(response);
  });

  it("should handle error during posting map data", async () => {
    // Define the map data and the expected error response
    const mapObject = { id: 1, name: "Test Map" };
    const errorMessage = "Failed to save map";

    // Set up Nock to intercept the POST request and return a mock error
    nock("http://localhost")
      .post("/save-map", mapObject)
      .reply(500, { message: errorMessage });

    // Render the hook
    const { result } = renderHook(() => usePostMapData(), { wrapper: Wrapper });

    // Act: Trigger the mutation
    act(() => {
      result.current.mutate(mapObject);
    });

    // Wait for the mutation to settle
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Assertions
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toEqual(new Error(errorMessage));
  });
});
