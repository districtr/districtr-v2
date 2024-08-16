import { useEffect, useState, useCallback } from "react";
import { Select } from "@radix-ui/themes";
import { getGerryDBViews } from "../../api/apiHandlers";
import { useMapStore } from "../../store/mapStore";
import { createMapDocument } from "../../api/apiHandlers";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function GerryDBViewSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [limit, setLimit] = useState<number>(20);
  const [offset, setOffset] = useState<number>(0);
  const { selectedLayer, setMapDocument } = useMapStore((state) => ({
    selectedLayer: state.selectedLayer,
    setMapDocument: state.setMapDocument,
  }));
  const document = useMutation({
    mutationFn: createMapDocument,
    onMutate: () => {
      console.log("Creating document");
    },
    onError: (error) => {
      console.error("Error creating map document: ", error);
    },
    onSuccess: (data) => {
      setMapDocument(data);
      const urlParams = new URLSearchParams(searchParams.toString());
      urlParams.set("document_id", data.document_id);
      router.push(pathname + "?" + urlParams.toString());
    },
  });
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["views", limit, offset],
    queryFn: () => getGerryDBViews(limit, offset),
  });

  const handleValueChange = (value: string) => {
    const selectedLayer = data?.find((view) => view.name === value);
    if (!selectedLayer || selectedLayer.name === document.data?.gerrydb_table) {
      return;
    }
    document.mutate({ gerrydb_table: selectedLayer.name });
  };

  useEffect(() => {
    console.log(selectedLayer);
  }, [selectedLayer]);

  if (isPending) return <div>Loading geographies... 🌎</div>;

  if (isError) return <div>Error loading geographies: {error.message}</div>;

  return (
    <Select.Root
      size="3"
      defaultValue="Select a geography"
      onValueChange={handleValueChange}
      value={selectedLayer?.name}
    >
      <Select.Trigger />
      <Select.Content>
        <Select.Group>
          <Select.Label>Select a geography</Select.Label>
          {data.map((view, index) => (
            <Select.Item key={index} value={view.name}>
              {view.name}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
