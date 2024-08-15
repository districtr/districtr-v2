import { useEffect, useState, useCallback } from "react";
import { Select } from "@radix-ui/themes";
import { gerryDBView, getGerryDBViews } from "../../api/apiHandlers";
import { useMapStore } from "../../store/mapStore";
import { createMapDocument } from "../../api/apiHandlers";
import { useMutation } from "@tanstack/react-query";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function GerryDBViewSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<gerryDBView[]>([]);
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

  useEffect(() => {
    getGerryDBViews(limit, offset).then((views) => {
      setViews(views);
    });
  }, [limit, offset]);

  const handleValueChange = (value: string) => {
    const selectedLayer = views.find((view) => view.name === value);
    if (!selectedLayer || selectedLayer.name === document.data?.gerrydb_table) {
      return;
    }
    document.mutate({ gerrydb_table: selectedLayer.name });
  };

  useEffect(() => {
    console.log(selectedLayer);
  }, [selectedLayer]);

  if (views.length === 0) {
    return <div>Loading geographies... 🌎</div>;
  }

  return (
    <Select.Root
      size="3"
      defaultValue={undefined}
      onValueChange={handleValueChange}
      value={selectedLayer?.name}
    >
      <Select.Trigger />
      <Select.Content>
        <Select.Group>
          <Select.Label>Select a geography</Select.Label>
          {views.map((view, index) => (
            <Select.Item key={index} value={view.name}>
              {view.name}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
