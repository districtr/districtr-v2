import { useEffect, useState } from "react";
import { Select } from "@radix-ui/themes";
import { getAvailableDistrictrMaps } from "../../api/apiHandlers";
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
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const mapDocument = useMapStore((state) => state.mapDocument);
  const setMapDocument = useMapStore((state) => state.setMapDocument);
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
    queryFn: () => getAvailableDistrictrMaps(limit, offset),
  });

  useEffect(() => {
    if (mapDocument && data) {
      const selectedView = data.find(
        (view) => view.gerrydb_table_name === mapDocument.gerrydb_table,
      );
      setSelected(selectedView?.name);
    }
  }, [data, mapDocument]);

  const handleValueChange = (value: string) => {
    console.log("Value changed: ", value);
    const selectedDistrictrMap = data?.find((view) => view.name === value);
    console.log("Selected view: ", selectedDistrictrMap);
    setSelected(value);
    if (
      !selectedDistrictrMap ||
      selectedDistrictrMap.gerrydb_table_name === document.data?.gerrydb_table
    ) {
      console.log("No document or same document");
      return;
    }
    console.log("mutating to create new document");
    document.mutate({ gerrydb_table: selectedDistrictrMap.gerrydb_table_name });
  };

  if (isPending) return <div>Loading geographies... 🌎</div>;

  if (isError) return <div>Error loading geographies: {error.message}</div>;

  return (
    <Select.Root size="3" onValueChange={handleValueChange} value={selected}>
      <Select.Trigger placeholder="Select a geography" />
      <Select.Content>
        <Select.Group>
          <Select.Label>Districtr map options</Select.Label>
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
